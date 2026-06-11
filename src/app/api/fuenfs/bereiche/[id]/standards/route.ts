import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { legeFuenfsFotoAn } from "@/lib/dateien";

/**
 * Soll-Zustand-Fotos eines 5S-Bereichs (Seiketsu, KF3-36) — append-only
 * Galerie: das neueste Foto ist der gültige Standard, ältere sind Historie.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs");
  if ("status" in auth) return auth;

  const { id } = await params;
  const fotos = await prisma.datei.findMany({
    where: { fuenfsBereichId: id },
    select: { id: true, name: true, hinzugefuegt: true, hochgeladenVon: { select: { username: true } } },
    orderBy: { hinzugefuegt: "desc" },
  });
  return ok(fotos);
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs.audit");
  if ("status" in auth) return auth;

  const { id } = await params;
  const bereich = await prisma.fuenfSBereich.findUnique({ where: { id } });
  if (!bereich) return err("Bereich nicht gefunden", 404);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return err("file (multipart) erforderlich");

  return legeFuenfsFotoAn({ fuenfsBereichId: id }, file, auth.benutzer.id);
}
