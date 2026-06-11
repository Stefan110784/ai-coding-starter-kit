import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  sortorder: z.number().int().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const kat = await prisma.zeitkategorie.update({ where: { id }, data: parsed.data });
    return ok(kat);
  } catch (e) {
    return handlePrismaError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    await prisma.zeitkategorie.delete({ where: { id } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
