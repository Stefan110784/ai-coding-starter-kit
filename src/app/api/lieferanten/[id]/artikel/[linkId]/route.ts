import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; linkId: string }> };

const patchSchema = z.object({
  einkaufspreis: z.number().min(0).optional(),
  mindestmenge: z.number().positive().optional(),
  bestellkosten: z.number().min(0).nullable().optional(),
  lagerkostensatz: z.number().min(0).nullable().optional(),
  jahresbedarf: z.number().min(0).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id, linkId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const link = await prisma.artikelLieferant.findUnique({ where: { id: linkId } });
  if (!link || link.lieferantId !== id) return err("Verknüpfung nicht gefunden", 404);

  // Auf die Decimal(10,4)-Genauigkeit der DB runden — sonst gilt z. B. 1.23456
  // bei jedem PATCH erneut als „Änderung“ und erzeugt Duplikat-Historienzeilen
  const neuerPreis =
    parsed.data.einkaufspreis !== undefined
      ? Math.round(parsed.data.einkaufspreis * 10000) / 10000
      : undefined;

  try {
    const aktualisiert = await prisma.$transaction(async (tx) => {
      const neu = await tx.artikelLieferant.update({
        where: { id: linkId },
        data: { ...parsed.data, ...(neuerPreis !== undefined ? { einkaufspreis: neuerPreis } : {}) },
        include: { artikel: { select: { artikelnummer: true, bezeichnung: true, einheit: true } } },
      });
      // Preishistorie (KF3-31): Preisänderung hängt eine Zeile an
      if (neuerPreis !== undefined && Number(link.einkaufspreis) !== neuerPreis) {
        await tx.artikelLieferantPreis.create({
          data: {
            artikelLieferantId: linkId,
            artikelnummer: link.artikelnummer,
            lieferantId: link.lieferantId,
            preis: neuerPreis,
            quelle: "manuell",
            benutzerId: auth.benutzer.id,
          },
        });
      }
      return neu;
    });
    return ok(aktualisiert);
  } catch (e) {
    return handlePrismaError(e);
  }
}

/** Preishistorie eines Artikel-Lieferant-Links (KF3-31), neueste zuerst. */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lieferanten");
  if ("status" in auth) return auth;

  const { id, linkId } = await params;
  const link = await prisma.artikelLieferant.findUnique({ where: { id: linkId } });
  if (!link || link.lieferantId !== id) return err("Verknüpfung nicht gefunden", 404);

  const preise = await prisma.artikelLieferantPreis.findMany({
    where: { artikelLieferantId: linkId },
    include: { benutzer: { select: { username: true, name: true } } },
    orderBy: { gueltigAb: "desc" },
    take: 50,
  });
  return ok(preise.map((p) => ({ ...p, preis: Number(p.preis) })));
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id, linkId } = await params;
  const link = await prisma.artikelLieferant.findUnique({ where: { id: linkId } });
  if (!link || link.lieferantId !== id) return err("Verknüpfung nicht gefunden", 404);

  try {
    await prisma.artikelLieferant.delete({ where: { id: linkId } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
