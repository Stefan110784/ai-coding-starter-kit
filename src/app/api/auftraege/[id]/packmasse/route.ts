import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

const schema = z.array(
  z.object({
    name: z.string().optional().nullable(),
    laenge: z.number().optional().nullable(),
    breite: z.number().optional().nullable(),
    hoehe: z.number().optional().nullable(),
    gewicht: z.number().optional().nullable(),
  })
);

/**
 * Ersetzt alle Packmaße (Kisten/Kartons) eines Auftrags durch die Liste
 * (V2: PUT /{id}/packmasse, Recht auftraege.status). Leere Zeilen werden
 * verworfen; die Reihenfolge bestimmt `position`.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "auftraege.status");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const auftrag = await prisma.auftrag.findUnique({ where: { id } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);

  const gueltige = parsed.data.filter(
    (p) =>
      (p.name && p.name.trim()) ||
      [p.laenge, p.breite, p.hoehe, p.gewicht].some((v) => v != null)
  );

  try {
    const packmasse = await prisma.$transaction(async (tx) => {
      await tx.auftragPackmass.deleteMany({ where: { auftragId: id } });
      for (let pos = 0; pos < gueltige.length; pos++) {
        const p = gueltige[pos];
        await tx.auftragPackmass.create({
          data: {
            auftragId: id,
            name: p.name?.trim() || null,
            laenge: p.laenge ?? null,
            breite: p.breite ?? null,
            hoehe: p.hoehe ?? null,
            gewicht: p.gewicht ?? null,
            position: pos,
          },
        });
      }
      return tx.auftragPackmass.findMany({ where: { auftragId: id }, orderBy: { position: "asc" } });
    });
    return ok(packmasse);
  } catch (e) {
    return handlePrismaError(e);
  }
}
