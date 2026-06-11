import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditFeldDiff } from "@/lib/audit";

/**
 * Grund-Katalog pflegen (KF3-34). Bewusst KEIN DELETE: Gründe hängen an
 * ISO-Aufzeichnungen (Abweichungen) — deaktivieren statt löschen.
 */

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    bereich: z.enum(["nacharbeit", "fehlteil", "wareneingang", "fuenfs"]).optional(),
    aktiv: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Keine Änderung übergeben" });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const grund = await prisma.$transaction(async (tx) => {
      const alt = await tx.abweichungsGrund.findUnique({ where: { id } });
      if (!alt) throw new NichtGefunden();
      const neu = await tx.abweichungsGrund.update({ where: { id }, data: parsed.data });
      // Katalog-Änderungen sind ISO-relevant (Pareto-Basis) → Audit
      await auditFeldDiff(tx, "abweichungsGrund", id, auth.benutzer.id, alt, parsed.data, [
        "name",
        "bereich",
        "aktiv",
      ]);
      return neu;
    });
    return ok(grund);
  } catch (e) {
    if (e instanceof NichtGefunden) return err("Grund nicht gefunden", 404);
    return handlePrismaError(e);
  }
}

class NichtGefunden extends Error {}
