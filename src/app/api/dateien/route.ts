import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, requireAdmin, err, ok } from "@/lib/api-helpers";
import { legeDateiAn } from "@/lib/dateien";

/** Anhänge eines Auftrags (alles außer Fotos; V2: GET /api/dateien). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auftraege");
  if ("status" in auth) return auth;

  const auftragId = req.nextUrl.searchParams.get("auftragId");
  if (!auftragId) return err("auftragId erforderlich");

  const dateien = await prisma.datei.findMany({
    // Prisma-`not` schließt NULL aus → NULL-quelle explizit einschließen
    where: { auftragId, OR: [{ quelle: null }, { quelle: { not: "foto" } }] },
    orderBy: { hinzugefuegt: "asc" },
  });
  return ok(dateien);
}

/** Anhang hochladen (multipart, nur Admin; V2: POST /api/dateien). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const form = await req.formData().catch(() => null);
  if (!form) return err("Multipart-Formular erwartet");
  const auftragId = req.nextUrl.searchParams.get("auftragId") ?? String(form.get("auftragId") ?? "");
  const file = form.get("datei");
  if (!auftragId) return err("auftragId erforderlich");
  if (!(file instanceof File)) return err("Feld 'datei' erforderlich");

  return legeDateiAn(auftragId, file, { foto: false, benutzerId: auth.benutzer.id });
}
