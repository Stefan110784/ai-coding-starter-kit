import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { legeDateiAn } from "@/lib/dateien";

/** Fotos eines Auftrags (V2: GET /api/fotos). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auftraege");
  if ("status" in auth) return auth;

  const auftragId = req.nextUrl.searchParams.get("auftragId");
  if (!auftragId) return err("auftragId erforderlich");

  const fotos = await prisma.datei.findMany({
    where: { auftragId, quelle: "foto" },
    orderBy: { hinzugefuegt: "asc" },
  });
  return ok(fotos);
}

/** Foto hochladen — erfordert das Auftrags-Recht (vormals nur angemeldet). */
export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "auftraege");
  if ("status" in auth) return auth;

  const form = await req.formData().catch(() => null);
  if (!form) return err("Multipart-Formular erwartet");
  const auftragId = req.nextUrl.searchParams.get("auftragId") ?? String(form.get("auftragId") ?? "");
  const file = form.get("datei");
  if (!auftragId) return err("auftragId erforderlich");
  if (!(file instanceof File)) return err("Feld 'datei' erforderlich");

  return legeDateiAn(auftragId, file, { foto: true });
}
