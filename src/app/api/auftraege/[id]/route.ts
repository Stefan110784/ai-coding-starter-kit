import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { hatRecht } from "@/lib/rechte";
import { parseLiefertermin } from "@/lib/liefertermin";
import {
  nettobedarfFuerAuftrag,
  sollSekundenNetto,
  entnahmenBuchen,
  fertigmeldungBuchen,
  fertigmeldungStornieren,
  type NettobedarfResult,
  type BedarfPosition,
} from "@/lib/stueckliste";
import type { Prisma } from "@/generated/prisma";

const updateSchema = z.object({
  bezeichnung: z.string().optional(),
  menge: z.number().positive().optional(),
  kunde: z.string().optional().nullable(),
  liefertermin: z.string().optional().nullable(),
  abNummer: z.string().optional().nullable(),
  notiz: z.string().optional().nullable(),
  pausengrund: z.string().optional().nullable(),
  status: z
    .enum(["offen", "kommissioniert", "laeuft", "pausiert", "abgeschlossen"])
    .optional(),
  reworkRequired: z.boolean().optional(),
  reworkReason: z.string().optional().nullable(),
  stalledMissingParts: z.boolean().optional(),
  stallDays: z.number().int().optional().nullable(),
  kpiAusgeschlossen: z.boolean().optional(),
  promisedDate: z.string().datetime().optional().nullable(),
  promisedDateManuell: z.boolean().optional(),
  prioritaet: z.number().int().min(0).max(2).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const auftrag = await prisma.auftrag.findUnique({
    where: { id },
    include: {
      positionen: { include: { artikel: true } },
      zeiten: { include: { mitarbeiter: true, kategorie: true } },
      qualitaet: { include: { mitarbeiter: true } },
      dateien: true,
      zuweisungen: { include: { mitarbeiter: true } },
      team: { include: { mitarbeiter: { select: { id: true, name: true, kuerzel: true } } } },
      packmasse: { orderBy: { position: "asc" } },
    },
  });

  if (!auftrag) return err("Auftrag nicht gefunden", 404);
  return ok(auftrag);
}

class MangelError extends Error {
  constructor(public mangelnd: BedarfPosition[]) {
    super("Materialmangel");
  }
}

async function ersterAktiverLagerortId(tx: Prisma.TransactionClient): Promise<string | null> {
  const erster = await tx.lagerort.findFirst({ where: { aktiv: true }, orderBy: { name: "asc" } });
  return erster?.id ?? null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  // Statusänderung erfordert das Recht auftraege.status (V2-Parität).
  if (parsed.data.status !== undefined && !hatRecht(auth.benutzer, "auftraege.status")) {
    return err("Keine Berechtigung zur Statusänderung", 403);
  }

  const lagerortParam = req.nextUrl.searchParams.get("lagerortId");
  const force = req.nextUrl.searchParams.get("force") === "true";

  const { status: neuerStatus, ...felder } = parsed.data;
  const lieferterminGeaendert = "liefertermin" in parsed.data;
  const promisedDateExplizit = "promisedDate" in parsed.data;
  const manuellFlagExplizit = "promisedDateManuell" in parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const auftrag = await tx.auftrag.findUnique({ where: { id } });
      if (!auftrag) throw new MangelNotFound();

      const data: Prisma.AuftragUpdateInput = { ...felder };

      // --- Auto-Ableitung promisedDate aus Liefertermin (V2: auftraege.py:268-276) ---
      const effLiefertermin = lieferterminGeaendert ? (felder.liefertermin ?? null) : auftrag.liefertermin;
      const effManuell = manuellFlagExplizit ? (felder.promisedDateManuell as boolean) : auftrag.promisedDateManuell;
      if (!effManuell && !promisedDateExplizit) {
        if (lieferterminGeaendert || (auftrag.promisedDate === null && effLiefertermin)) {
          data.promisedDate = parseLiefertermin(effLiefertermin);
        } else if (manuellFlagExplizit) {
          // Sperr-Flag explizit zurückgesetzt → sofort neu ableiten
          data.promisedDate = parseLiefertermin(effLiefertermin);
        }
      }

      let materialInfo: NettobedarfResult | null = null;

      if (neuerStatus !== undefined) {
        const istLager = auftrag.nummer.startsWith("L");

        // Kommissionierungs-Hook: Bedarf prüfen, Soll-Zeit einfrieren, Entnahmen buchen
        if (neuerStatus === "kommissioniert" && auftrag.status === "offen") {
          const bedarf = await nettobedarfFuerAuftrag(tx, id);
          materialInfo = bedarf;
          // Soll-Zeit VOR der Entnahme-Buchung einfrieren (Bestand = Vor-Kommissionier-Stand)
          const soll = await sollSekundenNetto(tx, id);
          data.planZeitSekunden = soll != null ? Math.round(soll) : null;
          if (bedarf.mangel && !force) throw new MangelError(bedarf.mangelnd);
          const lagerortId = lagerortParam ?? (await ersterAktiverLagerortId(tx));
          if (lagerortId) await entnahmenBuchen(tx, id, auth.benutzer.id, lagerortId, bedarf);
        }

        // Fertigmeldungs-Hook (L-Aufträge): Zugang bei Abschluss, Storno bei Reaktivierung
        if (istLager && neuerStatus === "abgeschlossen" && auftrag.status !== "abgeschlossen") {
          const lagerortId = lagerortParam ?? (await ersterAktiverLagerortId(tx));
          if (lagerortId) await fertigmeldungBuchen(tx, id, auth.benutzer.id, lagerortId);
        } else if (istLager && auftrag.status === "abgeschlossen" && neuerStatus !== "abgeschlossen") {
          await fertigmeldungStornieren(tx, id);
        }

        // Nicht-Lager-Aufträge: Entnahmen nachbuchen wenn Kommissionierung übersprungen wurde
        if (!istLager && neuerStatus === "abgeschlossen" && auftrag.status !== "abgeschlossen") {
          const hatEntnahme = await tx.materialbewegung.findFirst({
            where: { auftragId: id, art: "entnahme" },
          });
          if (!hatEntnahme) {
            const lagerortId = lagerortParam ?? (await ersterAktiverLagerortId(tx));
            if (lagerortId) await entnahmenBuchen(tx, id, auth.benutzer.id, lagerortId);
          }
        }

        // Pause: offene Zeitbuchungen schließen (V2: schliesse_offene_buchungen)
        if (neuerStatus === "pausiert" && auftrag.status !== "pausiert") {
          await tx.auftragszeit.updateMany({
            where: { auftragId: id, ende: null },
            data: { ende: new Date(), beendetDurch: "pause" },
          });
        }

        data.status = neuerStatus;
        if (neuerStatus === "laeuft" && auftrag.start === null) data.start = new Date();
        if (neuerStatus === "abgeschlossen") {
          if (auftrag.ende === null) data.ende = new Date();
        } else {
          data.ende = null;
        }
      }

      const updated = await tx.auftrag.update({ where: { id }, data });
      return { updated, materialInfo };
    });

    return ok(
      result.materialInfo ? { ...result.updated, material: result.materialInfo } : result.updated
    );
  } catch (e) {
    if (e instanceof MangelError) {
      return NextResponse.json(
        {
          error: "Materialmangel",
          mangelnd: e.mangelnd,
          hinweis: "force=true übergeben, um trotzdem zu kommissionieren",
        },
        { status: 409 }
      );
    }
    if (e instanceof MangelNotFound) return err("Auftrag nicht gefunden", 404);
    return handlePrismaError(e);
  }
}

class MangelNotFound extends Error {}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    await prisma.auftrag.delete({ where: { id } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
