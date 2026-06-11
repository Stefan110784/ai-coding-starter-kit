import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";

/**
 * Kundenaufträge (Anforderung Kap. 6; KF3-37): Vertriebs-Schicht über den
 * Fertigungsaufträgen. Status "neu" entspricht der späteren CAS-Phase-1-Anlage;
 * die Fertigungsfreigabe bleibt ein manueller Statuswechsel.
 */

const createSchema = z.object({
  kundeId: z.string().uuid(),
  bezeichnung: z.string().trim().max(300).optional(),
  bestellNrKunde: z.string().trim().max(100).optional(),
  wunschtermin: z.string().datetime().optional(),
  bestaetigtTermin: z.string().datetime().optional(),
  notiz: z.string().trim().max(2000).optional(),
});

const OFFENE_STATUS = ["neu", "freigegeben"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "vertrieb");
  if ("status" in auth) return auth;

  const filter = req.nextUrl.searchParams.get("status"); // "offen" | "alle"
  const kundenauftraege = await prisma.kundenauftrag.findMany({
    where: {
      aktiv: true,
      ...(filter === "alle" ? {} : { status: { in: [...OFFENE_STATUS] } }),
    },
    include: {
      kunde: { select: { id: true, name: true, nr: true } },
      auftraege: { select: { id: true, nummer: true, status: true } },
    },
    orderBy: { nr: "desc" },
    take: 200,
  });

  return ok(
    kundenauftraege.map((k) => ({
      ...k,
      faGesamt: k.auftraege.length,
      faAbgeschlossen: k.auftraege.filter((a) => a.status === "abgeschlossen").length,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "vertrieb.bearbeiten");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  const kunde = await prisma.kunde.findUnique({ where: { id: parsed.data.kundeId } });
  if (!kunde || !kunde.aktiv) return err("Kunde nicht gefunden oder deaktiviert", 404);

  const { wunschtermin, bestaetigtTermin, ...felder } = parsed.data;

  try {
    const angelegt = await prisma.$transaction(async (tx) => {
      const ka = await tx.kundenauftrag.create({
        data: {
          ...felder,
          wunschtermin: wunschtermin ? new Date(wunschtermin) : undefined,
          bestaetigtTermin: bestaetigtTermin ? new Date(bestaetigtTermin) : undefined,
          erstelltVonId: auth.benutzer.id,
        },
        include: { kunde: { select: { name: true, nr: true } } },
      });
      await auditEintrag(tx, {
        entitaet: "kundenauftrag",
        entitaetId: ka.id,
        aktion: "erstellt",
        kontext: { nr: ka.nr, kunde: ka.kunde.name },
        benutzerId: auth.benutzer.id,
      });
      return ka;
    });
    return ok(angelegt, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
