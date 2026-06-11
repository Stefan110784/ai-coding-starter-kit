import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag, auditFeldDiff } from "@/lib/audit";
import type { KundenauftragStatus } from "@/generated/prisma";

/**
 * Kundenauftrag-Detail + Statusführung (KF3-37).
 * Lebenszyklus: neu → freigegeben (manuelle Fertigungsfreigabe) → geliefert;
 * storniert aus neu/freigegeben. Reaktivierung nur Admin. Kein Auto-Abschluss
 * aus Fertigungsaufträgen — die UI zeigt nur einen Hinweis.
 */

const updateSchema = z
  .object({
    status: z.enum(["neu", "freigegeben", "geliefert", "storniert"]).optional(),
    bezeichnung: z.string().trim().max(300).nullable().optional(),
    bestellNrKunde: z.string().trim().max(100).nullable().optional(),
    wunschtermin: z.string().datetime().nullable().optional(),
    bestaetigtTermin: z.string().datetime().nullable().optional(),
    geliefertAm: z.string().datetime().nullable().optional(),
    notiz: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Keine Änderung übergeben" });

/** Erlaubte Statuswechsel; Reaktivierungen (rückwärts) nur für Admins. */
const VORWAERTS: Record<KundenauftragStatus, KundenauftragStatus[]> = {
  neu: ["freigegeben", "storniert"],
  freigegeben: ["geliefert", "storniert"],
  geliefert: [],
  storniert: [],
};
const RUECKWAERTS: Record<KundenauftragStatus, KundenauftragStatus[]> = {
  neu: [],
  freigegeben: ["neu"],
  geliefert: ["freigegeben"],
  storniert: ["neu"],
};

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "vertrieb");
  if ("status" in auth) return auth;

  const { id } = await params;
  const ka = await prisma.kundenauftrag.findUnique({
    where: { id },
    include: {
      kunde: true,
      erstelltVon: { select: { username: true, name: true } },
      auftraege: {
        select: {
          id: true,
          nummer: true,
          bezeichnung: true,
          status: true,
          promisedDate: true,
          ende: true,
        },
        orderBy: { erstelltAm: "asc" },
      },
    },
  });
  if (!ka) return err("Kundenauftrag nicht gefunden", 404);

  return ok({
    ...ka,
    faGesamt: ka.auftraege.length,
    faAbgeschlossen: ka.auftraege.filter((a) => a.status === "abgeschlossen").length,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "vertrieb.bearbeiten");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const ka = await prisma.$transaction(async (tx) => {
      const alt = await tx.kundenauftrag.findUnique({ where: { id } });
      if (!alt) throw new NichtGefunden();

      const { status: neuerStatus, wunschtermin, bestaetigtTermin, geliefertAm, ...felder } = parsed.data;
      const data: Record<string, unknown> = { ...felder };
      if (wunschtermin !== undefined) data.wunschtermin = wunschtermin ? new Date(wunschtermin) : null;
      if (bestaetigtTermin !== undefined) {
        data.bestaetigtTermin = bestaetigtTermin ? new Date(bestaetigtTermin) : null;
      }
      if (geliefertAm !== undefined) data.geliefertAm = geliefertAm ? new Date(geliefertAm) : null;

      if (neuerStatus !== undefined && neuerStatus !== alt.status) {
        const vorwaerts = VORWAERTS[alt.status].includes(neuerStatus);
        const rueckwaerts = RUECKWAERTS[alt.status].includes(neuerStatus);
        if (!vorwaerts && !rueckwaerts) {
          throw new UngueltigerWechsel(`${alt.status} → ${neuerStatus} ist nicht vorgesehen`);
        }
        if (rueckwaerts && auth.benutzer.rolle !== "admin") {
          throw new NurAdmin();
        }
        data.status = neuerStatus;
        // geliefert setzt das Lieferdatum (überschreibbar); Rücknahme leert es
        if (neuerStatus === "geliefert" && data.geliefertAm === undefined && alt.geliefertAm === null) {
          data.geliefertAm = new Date();
        }
        if (neuerStatus !== "geliefert" && alt.status === "geliefert" && data.geliefertAm === undefined) {
          data.geliefertAm = null;
        }
        await auditEintrag(tx, {
          entitaet: "kundenauftrag",
          entitaetId: id,
          aktion: "statuswechsel",
          feld: "status",
          altWert: alt.status,
          neuWert: neuerStatus,
          kontext: { nr: alt.nr },
          benutzerId: auth.benutzer.id,
        });
      }

      await auditFeldDiff(tx, "kundenauftrag", id, auth.benutzer.id, alt, data, [
        "bezeichnung",
        "bestellNrKunde",
        "wunschtermin",
        "bestaetigtTermin",
        "geliefertAm",
        "notiz",
      ]);

      return tx.kundenauftrag.update({
        where: { id },
        data,
        include: { kunde: { select: { name: true, nr: true } } },
      });
    });
    return ok(ka);
  } catch (e) {
    if (e instanceof NichtGefunden) return err("Kundenauftrag nicht gefunden", 404);
    if (e instanceof UngueltigerWechsel) return err(`Statuswechsel ${e.message}`, 400);
    if (e instanceof NurAdmin) return err("Reaktivierung nur durch Admins", 403);
    return handlePrismaError(e);
  }
}

class NichtGefunden extends Error {}
class UngueltigerWechsel extends Error {}
class NurAdmin extends Error {}
