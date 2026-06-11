import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, err } from "@/lib/api-helpers";
import { hatRecht } from "@/lib/rechte";
import { dateiDownloadResponse, loescheDatei } from "@/lib/dateien";

type Params = { params: Promise<{ id: string }> };

/**
 * Anhang herunterladen (inline; V2: GET /api/dateien/{id}).
 * Rechte-Weiche nach Bezug (IDOR-Schutz, wie /api/fotos/[id]):
 * Auftrags-Anhänge brauchen "auftraege", 5S-Fotos "fuenfs" (KF3-36).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  const { id } = await params;
  const datei = await prisma.datei.findUnique({
    where: { id },
    select: { fuenfsPositionId: true, fuenfsBereichId: true },
  });
  if (!datei) return err("Datei nicht gefunden", 404);
  const noetig = datei.fuenfsPositionId || datei.fuenfsBereichId ? "fuenfs" : "auftraege";
  if (!hatRecht(auth.benutzer, noetig)) return err("Keine Berechtigung", 403);
  return dateiDownloadResponse(id);
}

/** Anhang löschen (nur Admin; V2: DELETE /api/dateien/{id}). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;
  const { id } = await params;
  return loescheDatei(id);
}
