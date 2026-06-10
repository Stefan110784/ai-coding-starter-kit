import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import {
  nettobedarfFuerAuftrag,
  bedarfsbaumFuerAuftrag,
  sollSekundenNetto,
} from "@/lib/stueckliste";

type Params = { params: Promise<{ auftragId: string }> };

/** Nettobedarf + Soll-Zeit + Strukturbaum eines Auftrags (V2: /api/material/bedarf/{id}). */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { auftragId } = await params;
  const auftrag = await prisma.auftrag.findUnique({ where: { id: auftragId } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);

  const [bedarf, sollSekundenNettoWert, baum] = await Promise.all([
    nettobedarfFuerAuftrag(prisma, auftragId),
    sollSekundenNetto(prisma, auftragId),
    bedarfsbaumFuerAuftrag(prisma, auftragId),
  ]);

  return ok({ ...bedarf, sollSekundenNetto: sollSekundenNettoWert, baum });
}
