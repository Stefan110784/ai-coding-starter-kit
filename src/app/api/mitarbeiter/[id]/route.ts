import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  kuerzel: z.string().min(1).max(5).optional(),
  status: z.enum(["aktiv", "inaktiv"]).optional(),
  wochenstunden: z.number().positive().max(60).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const data = {
    ...parsed.data,
    ...(parsed.data.kuerzel ? { kuerzel: parsed.data.kuerzel.toUpperCase() } : {}),
  };

  try {
    const mitarbeiter = await prisma.mitarbeiter.update({ where: { id }, data });
    return ok(mitarbeiter);
  } catch (e) {
    return handlePrismaError(e);
  }
}

/**
 * Deaktiviert einen Mitarbeiter (Soft-Delete). Hartes Löschen ist wegen der
 * Zeit-/Qualitäts-Bezüge nicht gewollt – der Status wird auf „inaktiv" gesetzt.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    const mitarbeiter = await prisma.mitarbeiter.update({
      where: { id },
      data: { status: "inaktiv" },
    });
    return ok(mitarbeiter);
  } catch (e) {
    return handlePrismaError(e);
  }
}
