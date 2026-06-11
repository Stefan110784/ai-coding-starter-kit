import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditFeldDiff } from "@/lib/audit";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    verantwortlichId: z.string().uuid().nullable().optional(),
    sortorder: z.number().int().optional(),
    aktiv: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Keine Änderung übergeben" });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const bereich = await prisma.$transaction(async (tx) => {
      const alt = await tx.fuenfSBereich.findUnique({ where: { id } });
      if (!alt) throw new NichtGefunden();
      const neu = await tx.fuenfSBereich.update({ where: { id }, data: parsed.data });
      await auditFeldDiff(tx, "fuenfsBereich", id, auth.benutzer.id, alt, parsed.data, [
        "name",
        "verantwortlichId",
        "aktiv",
      ]);
      return neu;
    });
    return ok(bereich);
  } catch (e) {
    if (e instanceof NichtGefunden) return err("Bereich nicht gefunden", 404);
    return handlePrismaError(e);
  }
}

class NichtGefunden extends Error {}
