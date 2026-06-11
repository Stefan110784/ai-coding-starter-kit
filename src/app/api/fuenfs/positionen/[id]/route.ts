import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

/** Audit-Position bewerten (Autosave je Klick) — nur solange Entwurf. */

const patchSchema = z
  .object({
    punkte: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullable().optional(),
    nichtAnwendbar: z.boolean().optional(),
    bemerkung: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Keine Änderung übergeben" });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs.audit");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  const position = await prisma.fuenfSAuditPosition.findUnique({
    where: { id },
    include: { audit: { select: { status: true } } },
  });
  if (!position) return err("Position nicht gefunden", 404);
  if (position.audit.status === "abgeschlossen") {
    return err("Audit ist abgeschlossen und unveränderbar", 400);
  }

  const data: Record<string, unknown> = { ...parsed.data };
  // n. a. löscht eine etwaige Bewertung (Score-Konsistenz)
  if (parsed.data.nichtAnwendbar === true) data.punkte = null;

  try {
    const neu = await prisma.fuenfSAuditPosition.update({ where: { id }, data });
    return ok(neu);
  } catch (e) {
    return handlePrismaError(e);
  }
}
