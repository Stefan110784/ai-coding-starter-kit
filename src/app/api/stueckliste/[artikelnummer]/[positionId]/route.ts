import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ artikelnummer: string; positionId: string }> };

/** Stücklisten-Position löschen (V2: stueckliste_position_loeschen, Recht verwaltung). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { artikelnummer, positionId } = await params;
  const nr = decodeURIComponent(artikelnummer);

  const pos = await prisma.stuecklistePosition.findUnique({ where: { id: positionId } });
  if (!pos || pos.parentArtikel !== nr) return err("Position nicht gefunden", 404);

  try {
    await prisma.stuecklistePosition.delete({ where: { id: positionId } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
