import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

const schema = z.object({ neueArtikelnummer: z.string().min(1) });

type Params = { params: Promise<{ artikelnummer: string }> };

/**
 * Benennt eine Artikelnummer (Primärschlüssel) um. Da das Schema kein
 * ON UPDATE CASCADE besitzt, geschieht das in einer Transaktion:
 * Kopie unter neuer Nummer anlegen → alle Verweise umhängen → alte Nummer löschen.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { artikelnummer: alt } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Neue Artikelnummer fehlt");
  const neu = parsed.data.neueArtikelnummer.trim();
  if (!neu) return err("Neue Artikelnummer fehlt");

  const a = await prisma.artikel.findUnique({ where: { artikelnummer: alt } });
  if (!a) return err("Artikel nicht gefunden", 404);
  if (neu === alt) return ok(a);
  if (await prisma.artikel.findUnique({ where: { artikelnummer: neu } })) {
    return err("Artikelnummer bereits vergeben", 409);
  }

  try {
    const artikel = await prisma.$transaction(async (tx) => {
      // 1. Kopie unter neuer Nummer
      await tx.artikel.create({ data: { ...a, artikelnummer: neu } });
      // 2. Alle Verweise umhängen
      await tx.stuecklistePosition.updateMany({ where: { parentArtikel: alt }, data: { parentArtikel: neu } });
      await tx.stuecklistePosition.updateMany({ where: { kindArtikel: alt }, data: { kindArtikel: neu } });
      await tx.auftragPosition.updateMany({ where: { artikelnummer: alt }, data: { artikelnummer: neu } });
      await tx.materialbewegung.updateMany({ where: { artikelnummer: alt }, data: { artikelnummer: neu } });
      await tx.inventurZaehlung.updateMany({ where: { artikelnummer: alt }, data: { artikelnummer: neu } });
      await tx.kommissionierCheck.updateMany({ where: { artikelnummer: alt }, data: { artikelnummer: neu } });
      await tx.artikelLieferant.updateMany({ where: { artikelnummer: alt }, data: { artikelnummer: neu } });
      // 3. Alte (jetzt referenzlose) Nummer löschen
      await tx.artikel.delete({ where: { artikelnummer: alt } });
      return tx.artikel.findUnique({ where: { artikelnummer: neu }, include: { lagerort: true } });
    });
    return ok(artikel);
  } catch (e) {
    return handlePrismaError(e);
  }
}
