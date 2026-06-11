import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";

/**
 * 5S-Maßnahme zu einer Audit-Position (KF3-36): legt transaktional eine
 * Abweichung typ=fuenfs an (CAPA, KF3-27) und verlinkt sie — bewusst OHNE
 * auftragId (Statusampel-Entscheidung).
 */

const createSchema = z.object({
  beschreibung: z.string().trim().min(1, "Beschreibung erforderlich").max(2000),
  grundId: z.string().uuid().optional(),
  verantwortlichId: z.string().uuid().optional(),
  faelligAm: z.string().datetime().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs.audit");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const abweichung = await prisma.$transaction(async (tx) => {
      const position = await tx.fuenfSAuditPosition.findUnique({
        where: { id },
        include: { audit: { include: { bereich: { select: { name: true, verantwortlichId: true } } } } },
      });
      if (!position) throw new NichtGefunden();
      if (position.audit.status === "abgeschlossen") throw new Abgeschlossen();
      if (position.abweichungId) throw new SchonVerknuepft();

      const { faelligAm, ...felder } = parsed.data;
      const angelegt = await tx.abweichung.create({
        data: {
          typ: "fuenfs",
          beschreibung: felder.beschreibung,
          grundId: felder.grundId,
          // Vorbelegung: Bereichs-Verantwortlicher, wenn keiner gewählt
          verantwortlichId: felder.verantwortlichId ?? position.audit.bereich.verantwortlichId,
          faelligAm: faelligAm ? new Date(faelligAm) : undefined,
          erfasstVonId: auth.benutzer.id,
        },
      });
      await tx.fuenfSAuditPosition.update({
        where: { id },
        data: { abweichungId: angelegt.id },
      });
      await auditEintrag(tx, {
        entitaet: "abweichung",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: {
          quelle: "fuenfsAudit",
          bereich: position.audit.bereich.name,
          monat: position.audit.monat,
          punkt: position.text,
        },
        benutzerId: auth.benutzer.id,
      });
      return angelegt;
    });
    return ok(abweichung, 201);
  } catch (e) {
    if (e instanceof NichtGefunden) return err("Position nicht gefunden", 404);
    if (e instanceof Abgeschlossen) return err("Audit ist abgeschlossen", 400);
    if (e instanceof SchonVerknuepft) return err("Position hat bereits eine Maßnahme", 409);
    return handlePrismaError(e);
  }
}

class NichtGefunden extends Error {}
class Abgeschlossen extends Error {}
class SchonVerknuepft extends Error {}
