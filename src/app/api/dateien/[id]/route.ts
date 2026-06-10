import { NextRequest } from "next/server";
import { requireRecht, requireAdmin } from "@/lib/api-helpers";
import { dateiDownloadResponse, loescheDatei } from "@/lib/dateien";

type Params = { params: Promise<{ id: string }> };

/**
 * Anhang herunterladen (inline; V2: GET /api/dateien/{id}).
 * Erfordert das Auftrags-Recht — verhindert, dass beliebige angemeldete Nutzer
 * fremde Anhänge über die Datei-ID abrufen (IDOR). Aufträge sind ein geteilter
 * Workspace; ein Pro-Auftrag-Zugriffsmodell existiert (noch) nicht.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "auftraege");
  if ("status" in auth) return auth;
  const { id } = await params;
  return dateiDownloadResponse(id);
}

/** Anhang löschen (nur Admin; V2: DELETE /api/dateien/{id}). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;
  const { id } = await params;
  return loescheDatei(id);
}
