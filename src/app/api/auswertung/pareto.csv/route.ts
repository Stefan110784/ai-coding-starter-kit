import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err } from "@/lib/api-helpers";
import { csvResponse } from "@/lib/csv";
import { paretoBerechnen } from "@/lib/pareto";
import { ladeParetoFehlteile, ladeParetoGruende } from "@/lib/pareto-daten";
import { paretoQuerySchema } from "../pareto/params";

/** CSV-Export der Pareto-Auswertung (KF3-34) — gleiche Parameter wie JSON. */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const parsed = paretoQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Parameter");
  const q = parsed.data;

  const roh =
    q.typ === "nacharbeitsgruende"
      ? await ladeParetoGruende(prisma, q.von, q.bis, q.abwTyp)
      : await ladeParetoFehlteile(prisma, q.von, q.bis, q.quelle);
  const ergebnis = paretoBerechnen(roh.zaehlung, q.limit);

  const rows = ergebnis.positionen.map((p, i) => ({
    rang: i + 1,
    schluessel: p.key,
    bezeichnung: p.label,
    anzahl: p.anzahl,
    prozent: p.prozent,
    kum_prozent: p.kumProzent,
  }));
  if (ergebnis.sonstigeAnzahl > 0) {
    rows.push({
      rang: rows.length + 1,
      schluessel: "sonstige",
      bezeichnung: "Sonstige",
      anzahl: ergebnis.sonstigeAnzahl,
      prozent: ergebnis.gesamt > 0 ? Math.round((ergebnis.sonstigeAnzahl / ergebnis.gesamt) * 1000) / 10 : 0,
      kum_prozent: 100,
    });
  }

  return csvResponse(
    rows,
    ["rang", "schluessel", "bezeichnung", "anzahl", "prozent", "kum_prozent"],
    `kima-pareto-${q.typ}-${q.von}-${q.bis}.csv`
  );
}
