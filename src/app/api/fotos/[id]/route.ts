import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err } from "@/lib/api-helpers";
import { dateiDownloadResponse, loescheDatei } from "@/lib/dateien";

type Params = { params: Promise<{ id: string }> };

/** Foto herunterladen (V2: GET /api/fotos/{id}). Erfordert das Auftrags-Recht (IDOR-Schutz). */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "auftraege");
  if ("status" in auth) return auth;
  const { id } = await params;
  return dateiDownloadResponse(id);
}

/**
 * Foto löschen: solange der Auftrag läuft, darf jeder mit Zugriff löschen
 * (z. B. verwackelte Aufnahme); nach Abschluss friert die Galerie als
 * Versand-Nachweis ein → nur noch Admin (V2-Regel).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "auftraege");
  if ("status" in auth) return auth;

  const { id } = await params;
  const datei = await prisma.datei.findUnique({
    where: { id },
    include: { auftrag: { select: { status: true } } },
  });
  if (!datei) return err("Datei nicht gefunden", 404);
  if (datei.auftrag?.status === "abgeschlossen" && auth.benutzer.rolle !== "admin") {
    return err("Auftrag abgeschlossen – Fotos darf nur ein Admin löschen.", 403);
  }
  return loescheDatei(id);
}
