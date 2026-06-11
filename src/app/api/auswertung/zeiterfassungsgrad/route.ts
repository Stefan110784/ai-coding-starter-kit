import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { zeiterfassungsgradFuerMonat, zeiterfassungsgradVerlauf } from "@/lib/zeiterfassungsgrad";
import { lokalDatum } from "@/lib/auswertung";

const MONAT_RX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Zeiterfassungsgrad (KF3-35) — Team/Monat. INVARIANTE: Die Response enthält
 * niemals Mitarbeiter-Arrays oder Personenwerte (Anforderung Kap. 4).
 * ?monat=JJJJ-MM für einen Monat, ?monate=N für den Verlauf (rückwärts).
 */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const heuteMonat = lokalDatum(new Date()).slice(0, 7);
  const monateParam = req.nextUrl.searchParams.get("monate");

  if (monateParam !== null) {
    const monate = parseInt(monateParam, 10);
    if (!Number.isFinite(monate) || monate < 2 || monate > 24) {
      return err("monate zwischen 2 und 24", 422);
    }
    const [jahr, monat] = heuteMonat.split("-").map(Number);
    const liste = [];
    for (let i = monate - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(jahr, monat - 1 - i, 1));
      const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      liste.push(m);
    }
    const verlauf = await zeiterfassungsgradVerlauf(prisma, liste);
    return ok(
      verlauf.map((g) => ({
        ...g,
        label: `${g.monat.slice(5)}/${g.monat.slice(0, 4)}`,
        laufend: g.monat === heuteMonat,
      }))
    );
  }

  const monat = req.nextUrl.searchParams.get("monat") ?? heuteMonat;
  if (!MONAT_RX.test(monat)) return err("monat als JJJJ-MM", 422);
  const grad = await zeiterfassungsgradFuerMonat(prisma, monat);
  return ok({ ...grad, laufend: monat === heuteMonat });
}
