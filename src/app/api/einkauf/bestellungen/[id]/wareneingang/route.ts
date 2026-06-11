import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";
import { gelieferteMengen, statusNachWareneingang, MENGEN_EPS } from "@/lib/bestellung";

/**
 * Wareneingang gegen Bestellung (Anforderung Kap. 3; KF3-30):
 * Soll-Ist-Abgleich, Teillieferungen, Eingangsprüfung (ISO 8.4/8.6) und
 * Statusautomatik in EINER Transaktion. Eigene Route statt Erweiterung von
 * POST /api/material/bewegungen — die generische Route bleibt für
 * bestellfreie Eingänge unverändert.
 */

const positionSchema = z
  .object({
    bestellPositionId: z.string().uuid(),
    menge: z.number().positive().max(1_000_000),
    lagerortId: z.string().uuid(),
    pruefErgebnis: z.enum(["ok", "abweichend"]),
    pruefBemerkung: z.string().trim().max(2000).optional(),
  })
  .refine((p) => p.pruefErgebnis === "ok" || (p.pruefBemerkung && p.pruefBemerkung.length > 0), {
    message: "Bemerkung ist bei abweichender Eingangsprüfung Pflicht",
    path: ["pruefBemerkung"],
  });

const bodySchema = z.object({
  positionen: z
    .array(positionSchema)
    .min(1, "Mindestens eine Position")
    .max(200)
    // Duplikate würden den Überlieferungs-Check je Eintrag einzeln passieren
    .refine(
      (arr) => new Set(arr.map((p) => p.bestellPositionId)).size === arr.length,
      "Doppelte Bestellposition im Request"
    ),
  ueberlieferungBestaetigt: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

class Abbruch extends Error {
  constructor(public meldung: string, public status = 400, public detail?: unknown) {
    super(meldung);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const bestellung = await tx.bestellung.findUnique({
        where: { id },
        include: { positionen: true },
      });
      if (!bestellung) throw new Abbruch("Bestellung nicht gefunden", 404);
      if (bestellung.status === "storniert") throw new Abbruch("Bestellung ist storniert");
      if (bestellung.status === "angefragt") {
        throw new Abbruch("Bestellung ist noch nicht bestellt (Status angefragt)");
      }
      if (bestellung.status === "abgeschlossen") {
        throw new Abbruch(
          "Bestellung ist abgeschlossen — für Nachlieferungen zuerst den Status zurücksetzen"
        );
      }

      const posMap = new Map(bestellung.positionen.map((p) => [p.id, p]));
      for (const p of parsed.data.positionen) {
        if (!posMap.has(p.bestellPositionId)) {
          throw new Abbruch("Position gehört nicht zu dieser Bestellung");
        }
      }

      // Soll-Ist-Abgleich: Überlieferung nur mit expliziter Bestätigung.
      // Zuordnung über die Positions-ID — derselbe Artikel darf in mehreren
      // Positionen einer Bestellung stehen.
      const bisher = await gelieferteMengen(tx, bestellung.positionen.map((p) => p.id));
      const ueberliefert: Array<{
        bestellPositionId: string;
        artikelnummer: string;
        bestellt: number;
        wuerde: number;
      }> = [];
      for (const p of parsed.data.positionen) {
        const pos = posMap.get(p.bestellPositionId)!;
        const wuerde = (bisher.get(pos.id) ?? 0) + p.menge;
        if (wuerde > pos.menge + MENGEN_EPS) {
          ueberliefert.push({
            bestellPositionId: pos.id,
            artikelnummer: pos.artikelnummer,
            bestellt: pos.menge,
            wuerde,
          });
        }
      }
      if (ueberliefert.length > 0 && !parsed.data.ueberlieferungBestaetigt) {
        throw new Abbruch("Überlieferung — bitte bestätigen", 409, ueberliefert);
      }

      // Je Position: Bewegung (Zugang) + Eingangsprüfung; bei Abweichung
      // zusätzlich eine Lieferanten-Reklamation (KF3-27 dockt hier an)
      const bewegungen = [];
      for (const p of parsed.data.positionen) {
        const pos = posMap.get(p.bestellPositionId)!;
        const ueber = ueberliefert.find((u) => u.bestellPositionId === pos.id);
        const bewegung = await tx.materialbewegung.create({
          data: {
            artikelnummer: pos.artikelnummer,
            lagerortId: p.lagerortId,
            art: "wareneingang",
            menge: p.menge,
            auftragId: pos.auftragId,
            benutzerId: auth.benutzer.id,
            bestellPositionId: pos.id,
            // Bestellpreis speist die vorhandene Materialbewertung (F-8)
            einstandspreis: pos.preis,
            bemerkung: `WE Bestellung B-${bestellung.nr}${ueber ? " (Überlieferung bestätigt)" : ""}`,
          },
        });
        await tx.pruefung.create({
          data: {
            typ: "wareneingang",
            ergebnis: p.pruefErgebnis,
            bewegungId: bewegung.id,
            artikelnummer: pos.artikelnummer,
            menge: p.menge,
            bemerkung: p.pruefBemerkung || null,
            prueferId: auth.benutzer.id,
          },
        });
        if (p.pruefErgebnis === "abweichend") {
          // Default-Grund (KF3-34): ohne grundId würde „(ohne Grund)“ die
          // Lieferanten-Pareto dominieren; Präzisierung jederzeit am Vorgang
          let grund = await tx.abweichungsGrund.findUnique({
            where: { name: "Wareneingang abweichend" },
          });
          if (!grund) {
            grund = await tx.abweichungsGrund.create({
              data: { name: "Wareneingang abweichend", bereich: "wareneingang" },
            });
            // Katalog-Anlage auditieren — auch wenn sie hier systemseitig passiert
            await auditEintrag(tx, {
              entitaet: "abweichungsGrund",
              entitaetId: grund.id,
              aktion: "erstellt",
              kontext: { name: grund.name, bereich: grund.bereich, quelle: "wareneingang" },
              benutzerId: auth.benutzer.id,
            });
          }
          await tx.abweichung.create({
            data: {
              typ: "reklamationLieferant",
              artikelnummer: pos.artikelnummer,
              beschreibung: `WE B-${bestellung.nr}: ${p.pruefBemerkung}`,
              grundId: grund.id,
              erfasstVonId: auth.benutzer.id,
            },
          });
        }
        bewegungen.push(bewegung);
      }

      // Statusautomatik: voll geliefert → abgeschlossen, sonst teilgeliefert
      const nachher = await gelieferteMengen(tx, bestellung.positionen.map((p) => p.id));
      const neuerStatus = statusNachWareneingang(
        bestellung.positionen.map((p) => ({ menge: p.menge, geliefert: nachher.get(p.id) ?? 0 }))
      );
      if (neuerStatus !== bestellung.status) {
        await tx.bestellung.update({
          where: { id },
          data: {
            status: neuerStatus,
            ...(neuerStatus === "abgeschlossen" ? { abgeschlossenAm: new Date() } : {}),
          },
        });
        await auditEintrag(tx, {
          entitaet: "bestellung",
          entitaetId: id,
          aktion: "statuswechsel",
          feld: "status",
          altWert: bestellung.status,
          neuWert: neuerStatus,
          kontext: { nr: bestellung.nr, quelle: "wareneingang" },
          benutzerId: auth.benutzer.id,
        });
      }

      await auditEintrag(tx, {
        entitaet: "bestellung",
        entitaetId: id,
        aktion: "wareneingang",
        kontext: {
          nr: bestellung.nr,
          positionen: parsed.data.positionen.length,
          ...(ueberliefert.length > 0 ? { ueberlieferung: true } : {}),
        },
        benutzerId: auth.benutzer.id,
      });

      return { bewegungen: bewegungen.length, status: neuerStatus };
    },
    // Serialisierbar gegen parallele Buchungen auf dieselbe Bestellung: sonst
    // lesen beide Transaktionen denselben „bisher“-Stand und passieren den
    // Überlieferungs-Check gemeinsam (Konflikt → P2034 → 409, Client wiederholt).
    { isolationLevel: "Serializable" });

    return ok(result, 201);
  } catch (e) {
    if (e instanceof Abbruch) {
      return NextResponse.json(
        { error: e.meldung, ...(e.detail ? { ueberliefert: e.detail } : {}) },
        { status: e.status }
      );
    }
    return handlePrismaError(e);
  }
}
