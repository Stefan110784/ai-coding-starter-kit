import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { stuecklisteBaum, stuecklisteRekursiv, istErreichbar } from "@/lib/stueckliste";

type Params = { params: Promise<{ artikelnummer: string }> };

const createSchema = z.object({
  kindArtikel: z.string().min(1),
  menge: z.number().positive(),
  einheit: z.string().optional(),
  posNr: z.number().int().optional(),
});

/** Direkte Kinder + vollständige rekursive Auflösung (V2: stueckliste_lesen). */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { artikelnummer } = await params;
  const nr = decodeURIComponent(artikelnummer);
  const artikel = await prisma.artikel.findUnique({ where: { artikelnummer: nr } });
  if (!artikel) return err("Artikel nicht gefunden", 404);

  const [positionen, aufgeloest] = await Promise.all([
    stuecklisteBaum(prisma, nr),
    stuecklisteRekursiv(prisma, nr),
  ]);
  return ok({ artikelnummer: nr, bezeichnung: artikel.bezeichnung, positionen, aufgeloest });
}

/** Neue Stücklisten-Position (V2: stueckliste_position_hinzufuegen, Recht verwaltung). */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { artikelnummer } = await params;
  const nr = decodeURIComponent(artikelnummer);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const parent = await prisma.artikel.findUnique({ where: { artikelnummer: nr } });
  if (!parent) return err("Parent-Artikel nicht gefunden", 404);
  const kind = await prisma.artikel.findUnique({ where: { artikelnummer: parsed.data.kindArtikel } });
  if (!kind) return err("Kind-Artikel nicht gefunden", 404);

  // Zyklen-Check: der Parent darf nicht im Teilbaum des Kinds vorkommen
  // (strikter als V2, das nur den direkten Selbstbezug ablehnt).
  if (await istErreichbar(prisma, parsed.data.kindArtikel, nr)) {
    return err("Zirkuläre Referenz");
  }

  let posNr = parsed.data.posNr;
  if (posNr === undefined) {
    const max = await prisma.stuecklistePosition.aggregate({
      where: { parentArtikel: nr },
      _max: { posNr: true },
    });
    posNr = (max._max.posNr ?? 0) + 1;
  }

  try {
    const pos = await prisma.stuecklistePosition.create({
      data: {
        parentArtikel: nr,
        kindArtikel: parsed.data.kindArtikel,
        menge: parsed.data.menge,
        einheit: parsed.data.einheit ?? kind.einheit,
        posNr,
      },
    });
    return ok(pos, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
