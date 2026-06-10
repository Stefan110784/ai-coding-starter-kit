import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

/** Zählung verwerfen — nur aus dem Status "erfasst" (V2: POST /zaehlung/{id}/verwerfen). */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const { id } = await params;
  const zaehlung = await prisma.inventurZaehlung.findUnique({ where: { id } });
  if (!zaehlung) return err("Zählung nicht gefunden", 404);
  if (zaehlung.status !== "erfasst") return err("Zählung ist bereits gebucht oder verworfen", 409);

  try {
    await prisma.inventurZaehlung.update({ where: { id }, data: { status: "verworfen" } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
