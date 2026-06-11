import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ artikelnummer: string }> };

const patchSchema = z.object({
  bezeichnung: z.string().min(1).optional(),
  langtext: z.string().nullable().optional(),
  vorgabezeit: z.number().nullable().optional(),
  einheit: z.string().optional(),
  mindestbestand: z.number().nullable().optional(),
  lagerortId: z.string().uuid().nullable().optional(),
  produktfamilie: z.string().nullable().optional(),
  lagerplatzReihe: z.string().nullable().optional(),
  lagerplatzRegal: z.string().nullable().optional(),
  lagerplatzFach: z.string().nullable().optional(),
  lagerplatzPlatz: z.string().nullable().optional(),
  gesperrt: z.boolean().optional(),
  bestandAktiv: z.boolean().optional(),
  // Basissystem-Flag steuert die Produktgruppen-Erkennung im Beleg-Import
  istBasissystem: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { artikelnummer } = await params;
  const artikel = await prisma.artikel.findUnique({
    where: { artikelnummer },
    include: {
      lagerort: true,
      materialbewegungen: {
        orderBy: { gebuchtAm: "desc" },
        take: 20,
        include: { lagerort: true, auftrag: { select: { nummer: true } } },
      },
      stuecklistenOben: {
        include: { kind: { select: { artikelnummer: true, bezeichnung: true } } },
      },
      lieferanten: {
        include: { lieferant: { select: { id: true, name: true, lieferzeitTage: true } } },
        orderBy: { einkaufspreis: "asc" },
      },
    },
  });

  if (!artikel) return err("Artikel nicht gefunden", 404);
  return ok(artikel);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { artikelnummer } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const artikel = await prisma.artikel.update({
      where: { artikelnummer },
      // Jede explizite Speicherung gilt als Prüfbestätigung (wie V2).
      data: { ...parsed.data, ungeprueft: false },
      include: { lagerort: true },
    });
    return ok(artikel);
  } catch (e) {
    return handlePrismaError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { artikelnummer } = await params;
  try {
    await prisma.artikel.delete({ where: { artikelnummer } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
