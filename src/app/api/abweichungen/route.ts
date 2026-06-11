import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag, auditFeldDiff } from "@/lib/audit";

/** Abweichungen / Minimal-CAPA (ISO 8.7, 10.2; KF3-27). */

const createSchema = z.object({
  typ: z.enum(["nacharbeit", "ausschuss", "reklamationKunde", "reklamationLieferant"]),
  auftragId: z.string().uuid().optional(),
  artikelnummer: z.string().optional(),
  beschreibung: z.string().trim().min(1, "Beschreibung erforderlich"),
  ursache: z.string().trim().optional(),
  massnahme: z.string().trim().optional(),
  grundId: z.string().uuid().optional(),
  verantwortlichId: z.string().uuid().optional(),
  faelligAm: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const auftragId = searchParams.get("auftragId");
  const typ = searchParams.get("typ");

  const abweichungen = await prisma.abweichung.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(auftragId ? { auftragId } : {}),
      ...(typ ? { typ: typ as never } : {}),
    },
    include: {
      grund: true,
      verantwortlich: { select: { id: true, name: true, kuerzel: true } },
      erfasstVon: { select: { username: true, name: true } },
      auftrag: { select: { nummer: true, bezeichnung: true } },
    },
    orderBy: { erfasstAm: "desc" },
    take: 200,
  });

  return ok(abweichungen);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  const { faelligAm, ...data } = parsed.data;

  try {
    const abweichung = await prisma.$transaction(async (tx) => {
      const angelegt = await tx.abweichung.create({
        data: {
          ...data,
          faelligAm: faelligAm ? new Date(faelligAm) : undefined,
          erfasstVonId: auth.benutzer.id,
        },
        include: { grund: true, verantwortlich: true },
      });

      await auditEintrag(tx, {
        entitaet: "abweichung",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: { typ: angelegt.typ, beschreibung: angelegt.beschreibung },
        benutzerId: auth.benutzer.id,
      });

      // KPI-Kompatibilität: Nacharbeit am Auftrag spiegelt sich in
      // reworkRequired/reworkReason (kpiFuerZeitraum bleibt unverändert gültig).
      if (angelegt.typ === "nacharbeit" && angelegt.auftragId) {
        const auftrag = await tx.auftrag.findUnique({ where: { id: angelegt.auftragId } });
        if (auftrag) {
          const neu = { reworkRequired: true, reworkReason: angelegt.beschreibung };
          await auditFeldDiff(tx, "auftrag", auftrag.id, auth.benutzer.id, auftrag, neu, [
            "reworkRequired",
            "reworkReason",
          ]);
          await tx.auftrag.update({ where: { id: auftrag.id }, data: neu });
        }
      }

      return angelegt;
    });

    return ok(abweichung, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
