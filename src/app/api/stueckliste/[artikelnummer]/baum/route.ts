import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import { stuecklisteKanten } from "@/lib/stueckliste";

type Params = { params: Promise<{ artikelnummer: string }> };

/** Kompletter Teilbaum als rohe Kantenliste für die Pflegeansicht (V2: …/baum). */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { artikelnummer } = await params;
  const nr = decodeURIComponent(artikelnummer);
  const artikel = await prisma.artikel.findUnique({ where: { artikelnummer: nr } });
  if (!artikel) return err("Artikel nicht gefunden", 404);

  return ok({
    root: nr,
    bezeichnung: artikel.bezeichnung,
    kanten: await stuecklisteKanten(prisma, nr),
  });
}
