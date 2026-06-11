import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { bestandFuerArtikel } from "@/lib/bestand";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ lagerortId: z.string().uuid() });

/**
 * Zählung buchen (V2: POST /zaehlung/{id}/buchen).
 * Das Soll wird NEU berechnet (nicht der Snapshot!), weil sich der Bestand
 * seit dem Zählen geändert haben kann; bei Abweichung wird gewarnt.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const zaehlung = await prisma.inventurZaehlung.findUnique({ where: { id } });
  if (!zaehlung) return err("Zählung nicht gefunden", 404);
  if (zaehlung.status !== "erfasst") return err("Zählung ist bereits gebucht oder verworfen", 409);
  const lagerort = await prisma.lagerort.findUnique({ where: { id: parsed.data.lagerortId } });
  if (!lagerort) return err("Lagerort nicht gefunden", 404);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sollAktuell = await bestandFuerArtikel(tx, zaehlung.artikelnummer);
      const ist = zaehlung.istMenge ?? 0;
      const delta = Math.round((ist - sollAktuell) * 1000) / 1000;
      const abweichung = Math.round((sollAktuell - zaehlung.sollMenge) * 1000) / 1000;
      const warnung = Math.abs(abweichung) > 1e-9 ? abweichung : null;

      let bewegungId: string | null = null;
      if (delta !== 0) {
        const bewegung = await tx.materialbewegung.create({
          data: {
            artikelnummer: zaehlung.artikelnummer,
            lagerortId: parsed.data.lagerortId,
            art: "inventur",
            menge: delta,
            benutzerId: auth.benutzer.id,
            bemerkung: `Inventur: gezählt ${ist} (Soll ${sollAktuell})`,
          },
        });
        bewegungId = bewegung.id;
      }

      await tx.inventurZaehlung.update({
        where: { id },
        data: {
          status: "gebucht",
          lagerortId: parsed.data.lagerortId,
          bewegungId,
          gebuchtVonId: auth.benutzer.id,
          gebuchtAm: new Date(),
        },
      });

      const neuerBestand = await bestandFuerArtikel(tx, zaehlung.artikelnummer);
      return { ok: true, differenz: delta, sollAktuell, neuerBestand, warnung };
    });

    return ok(result);
  } catch (e) {
    return handlePrismaError(e);
  }
}
