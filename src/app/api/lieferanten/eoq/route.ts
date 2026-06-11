import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import { calculateEOQ, calculateAnnualCost, calculateReorderPoint } from "@/lib/eoq";

const schema = z.object({
  jahresbedarf: z.number().positive(),
  bestellkosten: z.number().positive(),
  lagerkostensatz: z.number().positive(),
  lieferzeitTage: z.number().int().min(0).optional().default(7),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const { jahresbedarf: D, bestellkosten: S, lagerkostensatz: H, lieferzeitTage } = parsed.data;

  const eoq = calculateEOQ(D, S, H);
  if (!eoq) return err("Berechnung nicht möglich");

  const tagesbedarf = D / 365;
  const bestellpunkt = calculateReorderPoint(tagesbedarf, lieferzeitTage);
  const jahreskostenOptimal = calculateAnnualCost(D, S, H, eoq);
  const anzahlBestellungen = D / eoq;

  return ok({
    eoq: Math.round(eoq * 100) / 100,
    bestellpunkt: Math.round(bestellpunkt * 100) / 100,
    jahreskostenOptimal: Math.round(jahreskostenOptimal * 100) / 100,
    anzahlBestellungen: Math.round(anzahlBestellungen * 10) / 10,
    bestellintervallTage: Math.round((365 / anzahlBestellungen) * 10) / 10,
  });
}
