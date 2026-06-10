import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

const patchSchema = z.object({
  gut: z.number().min(0).optional(),
  ausschuss: z.number().min(0).optional(),
  nacharbeit: z.number().min(0).optional(),
  bemerkung: z.string().nullable().optional(),
  mitarbeiterId: z.string().uuid().nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "qualitaet.loeschen");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const eintrag = await prisma.qualitaet.update({ where: { id }, data: parsed.data });
    return ok(eintrag);
  } catch (e) {
    return handlePrismaError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "qualitaet.loeschen");
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    await prisma.qualitaet.delete({ where: { id } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
