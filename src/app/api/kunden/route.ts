import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";

/**
 * Kundenstamm (Anforderung Kap. 6; KF3-37). Bewusst minimal — CAS genesisWorld
 * wird führend (KF3-38), Zuordnung über casGuid. Kein DELETE: Soft-Delete
 * über aktiv=false (CAS-Vorgabe Kap. 7).
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Name erforderlich").max(200),
  notiz: z.string().trim().max(2000).optional(),
  casGuid: z.string().trim().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "vertrieb");
  if ("status" in auth) return auth;

  // ?alle=1: auch deaktivierte (Verwaltungssicht)
  const alle = req.nextUrl.searchParams.get("alle") === "1";
  const kunden = await prisma.kunde.findMany({
    where: alle ? {} : { aktiv: true },
    include: { _count: { select: { kundenauftraege: true } } },
    orderBy: [{ aktiv: "desc" }, { name: "asc" }],
    take: 500,
  });
  return ok(kunden);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "vertrieb.bearbeiten");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const kunde = await prisma.$transaction(async (tx) => {
      const angelegt = await tx.kunde.create({
        data: { ...parsed.data, casGuid: parsed.data.casGuid || null },
      });
      await auditEintrag(tx, {
        entitaet: "kunde",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: { nr: angelegt.nr, name: angelegt.name },
        benutzerId: auth.benutzer.id,
      });
      return angelegt;
    });
    return ok(kunde, 201);
  } catch (e) {
    return handlePrismaError(e); // casGuid-Duplikat → 409
  }
}
