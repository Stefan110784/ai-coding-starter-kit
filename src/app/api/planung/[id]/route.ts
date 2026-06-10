import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";

const updateSchema = z.object({
  geplantVon: z.string().datetime().optional(),
  geplantBis: z.string().datetime().optional(),
  mitarbeiterId: z.string().uuid().optional(),
  notiz: z.string().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.geplantVon) data.geplantVon = new Date(parsed.data.geplantVon);
  if (parsed.data.geplantBis) data.geplantBis = new Date(parsed.data.geplantBis);

  const zuweisung = await prisma.auftragZuweisung.update({
    where: { id },
    data,
  });
  return ok(zuweisung);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  await prisma.auftragZuweisung.delete({ where: { id } });
  return ok({ ok: true });
}
