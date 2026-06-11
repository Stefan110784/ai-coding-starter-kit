import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditFeldDiff } from "@/lib/audit";

/** Kunde pflegen (KF3-37) — kein DELETE, deaktivieren über aktiv=false. */

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    notiz: z.string().trim().max(2000).nullable().optional(),
    casGuid: z.string().trim().max(100).nullable().optional(),
    aktiv: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Keine Änderung übergeben" });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "vertrieb.bearbeiten");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const kunde = await prisma.$transaction(async (tx) => {
      const alt = await tx.kunde.findUnique({ where: { id } });
      if (!alt) throw new NichtGefunden();
      const data = {
        ...parsed.data,
        ...(parsed.data.casGuid !== undefined ? { casGuid: parsed.data.casGuid || null } : {}),
      };
      const neu = await tx.kunde.update({ where: { id }, data });
      await auditFeldDiff(tx, "kunde", id, auth.benutzer.id, alt, data, [
        "name",
        "notiz",
        "casGuid",
        "aktiv",
      ]);
      return neu;
    });
    return ok(kunde);
  } catch (e) {
    if (e instanceof NichtGefunden) return err("Kunde nicht gefunden", 404);
    return handlePrismaError(e);
  }
}

class NichtGefunden extends Error {}
