import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";

/** 5S-Bereiche (KF3-36) — Stammdaten, kein DELETE (aktiv-Flag). */

const createSchema = z.object({
  name: z.string().trim().min(1, "Name erforderlich").max(100),
  verantwortlichId: z.string().uuid().nullable().optional(),
  sortorder: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "fuenfs");
  if ("status" in auth) return auth;

  const alle = req.nextUrl.searchParams.get("alle") === "1";
  const bereiche = await prisma.fuenfSBereich.findMany({
    where: alle ? {} : { aktiv: true },
    include: { verantwortlich: { select: { id: true, name: true, kuerzel: true } } },
    orderBy: [{ aktiv: "desc" }, { sortorder: "asc" }, { name: "asc" }],
  });
  return ok(bereiche);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const bereich = await prisma.$transaction(async (tx) => {
      const angelegt = await tx.fuenfSBereich.create({ data: parsed.data });
      await auditEintrag(tx, {
        entitaet: "fuenfsBereich",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: { name: angelegt.name },
        benutzerId: auth.benutzer.id,
      });
      return angelegt;
    });
    return ok(bereich, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
