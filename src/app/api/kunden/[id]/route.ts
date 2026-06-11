import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag, auditFeldDiff } from "@/lib/audit";

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

      // Deaktivieren nur ohne offene Kundenaufträge — sonst blieben sie
      // voll bedienbar, während der Kunde aus allen Listen verschwindet
      if (parsed.data.aktiv === false && alt.aktiv) {
        const offene = await tx.kundenauftrag.count({
          where: { kundeId: id, status: { in: ["neu", "freigegeben"] } },
        });
        if (offene > 0) throw new OffeneAuftraege(offene);
      }

      const data = {
        ...parsed.data,
        ...(parsed.data.casGuid !== undefined ? { casGuid: parsed.data.casGuid || null } : {}),
      };
      const neu = await tx.kunde.update({ where: { id }, data });

      // Rename propagiert auf verknüpfte Fertigungsaufträge — die Relation
      // ist führend, sonst divergieren kunde-String und Kundenauftrag
      if (parsed.data.name !== undefined && parsed.data.name !== alt.name) {
        const res = await tx.auftrag.updateMany({
          where: { kundenauftrag: { kundeId: id } },
          data: { kunde: parsed.data.name },
        });
        if (res.count > 0) {
          await auditEintrag(tx, {
            entitaet: "kunde",
            entitaetId: id,
            aktion: "nameNachgezogen",
            kontext: { fertigungsauftraege: res.count, neuerName: parsed.data.name },
            benutzerId: auth.benutzer.id,
          });
        }
      }

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
    if (e instanceof OffeneAuftraege) {
      return err(
        `Kunde hat ${e.anzahl} offene${e.anzahl === 1 ? "n" : ""} Kundenauftr${e.anzahl === 1 ? "ag" : "äge"} — erst abschließen oder stornieren`,
        409
      );
    }
    return handlePrismaError(e);
  }
}

class NichtGefunden extends Error {}
class OffeneAuftraege extends Error {
  constructor(public anzahl: number) {
    super("offene Kundenaufträge");
  }
}
