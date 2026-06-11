import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, err } from "@/lib/api-helpers";
import { hatRecht } from "@/lib/rechte";
import { dateiDownloadResponse, loescheDatei } from "@/lib/dateien";

type Params = { params: Promise<{ id: string }> };

/**
 * Foto herunterladen (V2: GET /api/fotos/{id}) — Rechte-Weiche nach Bezug
 * (IDOR-Schutz): Auftrags-Fotos brauchen "auftraege", 5S-Fotos "fuenfs".
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const datei = await prisma.datei.findUnique({
    where: { id },
    select: { auftragId: true, fuenfsPositionId: true, fuenfsBereichId: true },
  });
  if (!datei) return err("Datei nicht gefunden", 404);
  const noetig = datei.fuenfsPositionId || datei.fuenfsBereichId ? "fuenfs" : "auftraege";
  if (!hatRecht(auth.benutzer, noetig)) return err("Keine Berechtigung", 403);
  return dateiDownloadResponse(id);
}

/**
 * Foto löschen: solange der Auftrag läuft, darf jeder mit Zugriff löschen
 * (z. B. verwackelte Aufnahme); nach Abschluss friert die Galerie als
 * Versand-Nachweis ein → nur noch Admin (V2-Regel). 5S analog: nur solange
 * das Audit Entwurf ist; Standards (Bereichs-Fotos) löscht nur ein Admin
 * (append-only Versionierung).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const datei = await prisma.datei.findUnique({
    where: { id },
    include: {
      auftrag: { select: { status: true } },
      fuenfsPosition: { select: { audit: { select: { status: true } } } },
    },
  });
  if (!datei) return err("Datei nicht gefunden", 404);

  if (datei.fuenfsPositionId || datei.fuenfsBereichId) {
    if (!hatRecht(auth.benutzer, "fuenfs.audit")) return err("Keine Berechtigung", 403);
    if (datei.fuenfsBereichId && auth.benutzer.rolle !== "admin") {
      return err("Standard-Fotos darf nur ein Admin löschen (Versionierung).", 403);
    }
    if (datei.fuenfsPosition?.audit.status === "abgeschlossen" && auth.benutzer.rolle !== "admin") {
      return err("Audit abgeschlossen – Fotos darf nur ein Admin löschen.", 403);
    }
    return loescheDatei(id);
  }

  if (!hatRecht(auth.benutzer, "auftraege")) return err("Keine Berechtigung", 403);
  if (datei.auftrag?.status === "abgeschlossen" && auth.benutzer.rolle !== "admin") {
    return err("Auftrag abgeschlossen – Fotos darf nur ein Admin löschen.", 403);
  }
  return loescheDatei(id);
}
