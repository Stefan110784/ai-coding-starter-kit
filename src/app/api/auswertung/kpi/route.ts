import { NextRequest } from "next/server";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { auftraegeInWoche, kpiFuerZeitraum } from "@/lib/auswertung";

/** Alle 4 KPI-Kennzahlen für eine ISO-Kalenderwoche (V2: GET /api/auswertung/kpi). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const jahr = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  const woche = parseInt(req.nextUrl.searchParams.get("week") ?? "", 10);
  if (!Number.isFinite(jahr) || !Number.isFinite(woche)) return err("year und week erforderlich", 422);
  if (woche < 1 || woche > 53) return err("Kalenderwoche muss zwischen 1 und 53 liegen", 422);

  const auftraege = await auftraegeInWoche(jahr, woche);
  return ok({ year: jahr, week: woche, ...kpiFuerZeitraum(auftraege) });
}
