import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { bestandFuerArtikel } from "@/lib/bestand";

const createSchema = z.object({
  artikelnummer: z.string().min(1),
  istMenge: z.number().min(0),
  notiz: z.string().optional().nullable(),
});

/** Zählung erfassen: Soll-Menge als Bestands-Snapshot festhalten (V2: POST /zaehlung). */
export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const artikel = await prisma.artikel.findUnique({
    where: { artikelnummer: parsed.data.artikelnummer },
  });
  if (!artikel) return err("Artikel nicht gefunden", 404);

  const sollMenge = await bestandFuerArtikel(prisma, parsed.data.artikelnummer);

  try {
    const zaehlung = await prisma.inventurZaehlung.create({
      data: {
        artikelnummer: parsed.data.artikelnummer,
        sollMenge,
        istMenge: parsed.data.istMenge,
        notiz: parsed.data.notiz ?? null,
        status: "erfasst",
        erfasstVonId: auth.benutzer.id,
      },
      include: { erfasstVon: { select: { username: true, name: true } } },
    });
    return ok(
      {
        ...zaehlung,
        differenz: parsed.data.istMenge - sollMenge,
      },
      201
    );
  } catch (e) {
    return handlePrismaError(e);
  }
}
