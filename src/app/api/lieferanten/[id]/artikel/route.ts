import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  artikelnummer: z.string().min(1),
  einkaufspreis: z.number().min(0),
  mindestmenge: z.number().positive().default(1),
  // EOQ-Parameter (optional): Bestellkosten €/Bestellung, Lagerkostensatz €/Stk/Jahr
  bestellkosten: z.number().min(0).nullable().optional(),
  lagerkostensatz: z.number().min(0).nullable().optional(),
  jahresbedarf: z.number().min(0).nullable().optional(),
});

/** Artikel mit Lieferant verknüpfen (Material-Bezug des Lieferanten-Reiters). */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const lieferant = await prisma.lieferant.findUnique({ where: { id } });
  if (!lieferant) return err("Lieferant nicht gefunden", 404);
  const artikel = await prisma.artikel.findUnique({
    where: { artikelnummer: parsed.data.artikelnummer },
  });
  if (!artikel) return err("Artikel nicht gefunden", 404);

  try {
    const link = await prisma.artikelLieferant.create({
      data: { ...parsed.data, lieferantId: id },
      include: { artikel: { select: { artikelnummer: true, bezeichnung: true, einheit: true } } },
    });
    return ok(link, 201);
  } catch (e) {
    return handlePrismaError(e); // Duplikat (artikelnummer+lieferant) → 409
  }
}
