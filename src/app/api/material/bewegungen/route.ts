import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { bestandFuerArtikel } from "@/lib/bestand";

// Manuell buchbare Arten wie V2 — Entnahmen/Fertigmeldungen entstehen nur
// über die Status-Hooks des Auftrags bzw. /api/material/entnahme.
const createSchema = z.object({
  artikelnummer: z.string().min(1),
  lagerortId: z.string().uuid(),
  lagerortZielId: z.string().uuid().optional(),
  art: z.enum(["wareneingang", "korrektur", "umlagerung", "inventur"]),
  menge: z.number().refine((m) => m !== 0, "Menge darf nicht 0 sein"),
  bemerkung: z.string().optional(),
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
  const { artikelnummer, lagerortId, lagerortZielId, art, menge, bemerkung, einstandspreis, kostenstelle, kostentraeger } = parsed.data;

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
    return handlePrismaError(e);
  }

  return ok({ ok: true, bestand: await bestandFuerArtikel(prisma, artikelnummer) }, 201);
}
