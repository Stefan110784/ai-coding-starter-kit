import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditFeldDiff } from "@/lib/audit";

/**
 * Abweichung fortschreiben (KF3-27). Bewusst kein DELETE:
 * Abweichungen sind ISO-Aufzeichnungen (Kap. 8.7 / 10.2).
 */

const updateSchema = z.object({
  status: z.enum(["offen", "inBearbeitung", "abgeschlossen"]).optional(),
  beschreibung: z.string().trim().min(1).optional(),
  ursache: z.string().trim().optional().nullable(),
  massnahme: z.string().trim().optional().nullable(),
  grundId: z.string().uuid().optional().nullable(),
  verantwortlichId: z.string().uuid().optional().nullable(),
  faelligAm: z.string().datetime().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  // Fortschreiben/Abschließen ist QM-Arbeit → Funktionsrecht qualitaet
  // (Melden via POST bleibt für alle Angemeldeten offen).
  const auth = await requireRecht(req, "qualitaet");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const alt = await tx.abweichung.findUnique({ where: { id } });
      if (!alt) throw new NotFound();

      const { faelligAm, ...felder } = parsed.data;
      const data: Record<string, unknown> = { ...felder };
      if ("faelligAm" in parsed.data) {
        data.faelligAm = faelligAm ? new Date(faelligAm) : null;
      }
      // Abschluss-Zeitstempel automatisch führen
      if (felder.status === "abgeschlossen" && alt.status !== "abgeschlossen") {
        data.abgeschlossenAm = new Date();
      } else if (felder.status && felder.status !== "abgeschlossen") {
        data.abgeschlossenAm = null;
      }

      await auditFeldDiff(tx, "abweichung", id, auth.benutzer.id, alt, data, [
        "status",
        "beschreibung",
        "ursache",
        "massnahme",
        "grundId",
        "verantwortlichId",
        "faelligAm",
      ]);

      return tx.abweichung.update({
        where: { id },
        data,
        include: {
          grund: true,
          verantwortlich: { select: { id: true, name: true, kuerzel: true } },
        },
      });
    });

    return ok(updated);
  } catch (e) {
    if (e instanceof NotFound) return err("Abweichung nicht gefunden", 404);
    return handlePrismaError(e);
  }
}

class NotFound extends Error {}
