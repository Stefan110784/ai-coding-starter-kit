import { NextRequest } from "next/server";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { auftraegeInWoche, kpiFuerZeitraum } from "@/lib/auswertung";
import { isoWocheVonDatum, verschiebeIsoWoche } from "@/lib/isowoche";

/** KPI-Zeitreihe der letzten N ISO-Wochen, aktuelle Woche zuletzt (V2: /kpi/verlauf). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const weeks = parseInt(req.nextUrl.searchParams.get("weeks") ?? "8", 10) || 8;
  if (weeks < 2 || weeks > 26) return err("weeks muss zwischen 2 und 26 liegen", 422);

  const aktuell = isoWocheVonDatum(new Date());
  const ergebnis = [];
  for (let delta = weeks - 1; delta >= 0; delta--) {
    const ziel = verschiebeIsoWoche(aktuell.jahr, aktuell.woche, -delta);
    const auftraege = await auftraegeInWoche(ziel.jahr, ziel.woche);
    ergebnis.push({
      year: ziel.jahr,
      week: ziel.woche,
      label: `KW ${String(ziel.woche).padStart(2, "0")}/${ziel.jahr}`,
      ...kpiFuerZeitraum(auftraege),
    });
  }
  return ok(ergebnis);
}
