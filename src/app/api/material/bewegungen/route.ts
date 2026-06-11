import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { bestandFuerArtikel } from "@/lib/bestand";
import { auditEintrag } from "@/lib/audit";
import { gelieferteMengen, statusNachWareneingang, MENGEN_EPS } from "@/lib/bestellung";

// Manuell buchbare Arten wie V2 — Entnahmen/Fertigmeldungen entstehen nur
// über die Status-Hooks des Auftrags bzw. /api/material/entnahme.
const createSchema = z.object({
  artikelnummer: z.string().min(1),
  lagerortId: z.string().uuid(),
  lagerortZielId: z.string().uuid().optional(),
  art: z.enum(["wareneingang", "korrektur", "umlagerung", "inventur"]),
  menge: z.number().refine((m) => m !== 0, "Menge darf nicht 0 sein"),
  bemerkung: z.string().max(2000).optional(),
  // Korrektur einer WE-Fehlbuchung MIT Bestellbezug (KF3-30): hält die
  // gelieferte Menge der Position und damit Status/Bewertung korrekt.
  bestellPositionId: z.string().uuid().optional(),
  // Materialbewertung (KLR I): optionaler Einstandspreis + Kontierung.
  einstandspreis: z.number().nonnegative().optional(),
  kostenstelle: z.string().optional(),
  kostentraeger: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const artikelnummer = searchParams.get("artikelnummer");
  const lagerortId = searchParams.get("lagerortId");
  const auftragId = searchParams.get("auftragId");

  const skip = Math.max(0, parseInt(searchParams.get("skip") ?? "0", 10) || 0);
  const take = Math.min(200, Math.max(1, parseInt(searchParams.get("take") ?? "100", 10) || 100));
  const where = {
    ...(artikelnummer ? { artikelnummer } : {}),
    ...(lagerortId ? { lagerortId } : {}),
    ...(auftragId ? { auftragId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.materialbewegung.findMany({
      where,
      include: { artikel: true, lagerort: true, lagerortZiel: true, auftrag: true },
      orderBy: { gebuchtAm: "desc" },
      skip,
      take,
    }),
    prisma.materialbewegung.count({ where }),
  ]);

  return ok({ items, total });
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");
  const { artikelnummer, lagerortId, lagerortZielId, art, menge, bemerkung, bestellPositionId, einstandspreis, kostenstelle, kostentraeger } = parsed.data;
  if (bestellPositionId && art !== "korrektur") {
    return err("Bestellbezug ist nur bei Korrektur-Buchungen erlaubt (Wareneingänge über die Bestellung buchen)");
  }

  const artikel = await prisma.artikel.findUnique({ where: { artikelnummer } });
  if (!artikel) return err("Artikel nicht gefunden", 404);
  const lagerort = await prisma.lagerort.findUnique({ where: { id: lagerortId } });
  if (!lagerort) return err("Lagerort nicht gefunden", 404);

  try {
    if (art === "umlagerung") {
      // Zwei Zeilen wie V2: Menge negativ am Quell-, positiv am Ziellagerort.
      if (!lagerortZielId) return err("Ziellagerort erforderlich bei Umlagerung");
      if (lagerortZielId === lagerortId) return err("Quell- und Ziellagerort müssen unterschiedlich sein");
      const ziel = await prisma.lagerort.findUnique({ where: { id: lagerortZielId } });
      if (!ziel) return err("Ziellagerort nicht gefunden", 404);
      await prisma.$transaction([
        prisma.materialbewegung.create({
          data: {
            artikelnummer, lagerortId, lagerortZielId,
            art: "umlagerung", menge: -Math.abs(menge),
            benutzerId: auth.benutzer.id, bemerkung,
          },
        }),
        prisma.materialbewegung.create({
          data: {
            artikelnummer, lagerortId: lagerortZielId,
            art: "umlagerung", menge: Math.abs(menge),
            benutzerId: auth.benutzer.id, bemerkung,
          },
        }),
      ]);
    } else if (bestellPositionId) {
      // Korrektur mit Bestellbezug: Position prüfen, buchen und den
      // Bestellstatus aus den neuen Liefermengen ableiten — eine Transaktion.
      await prisma.$transaction(async (tx) => {
        const pos = await tx.bestellPosition.findUnique({
          where: { id: bestellPositionId },
          include: { bestellung: { include: { positionen: { select: { id: true, menge: true } } } } },
        });
        if (!pos) throw new BestellPositionFehlt();
        if (pos.artikelnummer !== artikelnummer) throw new ArtikelPasstNicht();

        await tx.materialbewegung.create({
          data: {
            artikelnummer, lagerortId, art, menge,
            benutzerId: auth.benutzer.id, bemerkung, bestellPositionId,
            einstandspreis, kostenstelle, kostentraeger,
          },
        });

        const best = pos.bestellung;
        if (["bestellt", "teilgeliefert", "abgeschlossen"].includes(best.status)) {
          const geliefert = await gelieferteMengen(tx, best.positionen.map((p) => p.id));
          const summe = [...geliefert.values()].reduce((s, m) => s + m, 0);
          // Volle Rücknahme → zurück auf bestellt, sonst Automatik wie im WE
          const neuerStatus =
            summe <= MENGEN_EPS
              ? "bestellt"
              : statusNachWareneingang(
                  best.positionen.map((p) => ({ menge: p.menge, geliefert: geliefert.get(p.id) ?? 0 }))
                );
          if (neuerStatus !== best.status) {
            await tx.bestellung.update({
              where: { id: best.id },
              data: {
                status: neuerStatus,
                abgeschlossenAm: neuerStatus === "abgeschlossen" ? new Date() : null,
              },
            });
            await auditEintrag(tx, {
              entitaet: "bestellung",
              entitaetId: best.id,
              aktion: "statuswechsel",
              feld: "status",
              altWert: best.status,
              neuWert: neuerStatus,
              kontext: { nr: best.nr, quelle: "korrektur" },
              benutzerId: auth.benutzer.id,
            });
          }
        }
      }, { isolationLevel: "Serializable" });
    } else {
      // Wareneingang immer positiv; Korrektur/Inventur dürfen negativ sein.
      await prisma.materialbewegung.create({
        data: {
          artikelnummer, lagerortId, art,
          menge: art === "wareneingang" ? Math.abs(menge) : menge,
          benutzerId: auth.benutzer.id, bemerkung,
          einstandspreis, kostenstelle, kostentraeger,
        },
      });
    }
  } catch (e) {
    if (e instanceof BestellPositionFehlt) return err("Bestellposition nicht gefunden", 404);
    if (e instanceof ArtikelPasstNicht) {
      return err("Artikel der Buchung passt nicht zur Bestellposition");
    }
    return handlePrismaError(e);
  }

  return ok({ ok: true, bestand: await bestandFuerArtikel(prisma, artikelnummer) }, 201);
}

class BestellPositionFehlt extends Error {}
class ArtikelPasstNicht extends Error {}
