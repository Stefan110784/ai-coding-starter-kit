import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; linkId: string }> };

const patchSchema = z.object({
  einkaufspreis: z.number().min(0).optional(),
  mindestmenge: z.number().positive().optional(),
  bestellkosten: z.number().min(0).nullable().optional(),
  lagerkostensatz: z.number().min(0).nullable().optional(),
  jahresbedarf: z.number().min(0).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id, linkId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const link = await prisma.artikelLieferant.findUnique({ where: { id: linkId } });
  if (!link || link.lieferantId !== id) return err("Verknüpfung nicht gefunden", 404);

  try {
    const aktualisiert = await prisma.artikelLieferant.update({
      where: { id: linkId },
      data: parsed.data,
      include: { artikel: { select: { artikelnummer: true, bezeichnung: true, einheit: true } } },
    });
    return ok(aktualisiert);
  } catch (e) {
    return handlePrismaError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id, linkId } = await params;
  const link = await prisma.artikelLieferant.findUnique({ where: { id: linkId } });
  if (!link || link.lieferantId !== id) return err("Verknüpfung nicht gefunden", 404);

  try {
    await prisma.artikelLieferant.delete({ where: { id: linkId } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
