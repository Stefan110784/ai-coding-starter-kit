import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err } from "@/lib/api-helpers";
import { legeFuenfsFotoAn } from "@/lib/dateien";

/** Ist-Foto einer 5S-Audit-Position (multipart, Feld "file") — nur Entwurf. */

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs.audit");
  if ("status" in auth) return auth;

  const { id } = await params;
  const position = await prisma.fuenfSAuditPosition.findUnique({
    where: { id },
    include: { audit: { select: { status: true } } },
  });
  if (!position) return err("Position nicht gefunden", 404);
  if (position.audit.status === "abgeschlossen") {
    return err("Audit ist abgeschlossen", 400);
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return err("file (multipart) erforderlich");

  return legeFuenfsFotoAn({ fuenfsPositionId: id }, file, auth.benutzer.id);
}
