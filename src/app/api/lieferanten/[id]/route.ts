import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  kontakt: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  telefon: z.string().nullable().optional(),
  lieferzeitTage: z.number().int().min(0).optional(),
  aktiv: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const lieferant = await prisma.lieferant.findUnique({
    where: { id },
    include: {
      artikel: {
        include: { artikel: { select: { artikelnummer: true, bezeichnung: true, einheit: true } } },
        orderBy: { artikelnummer: "asc" },
      },
    },
  });
  if (!lieferant) return err("Lieferant nicht gefunden", 404);
  return ok(lieferant);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const lieferant = await prisma.lieferant.update({ where: { id }, data: parsed.data });
    return ok(lieferant);
  } catch (e) {
    return handlePrismaError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    await prisma.lieferant.delete({ where: { id } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
