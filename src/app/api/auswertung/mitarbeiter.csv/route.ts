import { NextRequest } from "next/server";
import { requireRecht } from "@/lib/api-helpers";
import { mitarbeiterReport } from "@/lib/auswertung";
import { csvResponse } from "@/lib/csv";

/** Mitarbeiterzeiten-CSV (V2: GET /api/auswertung/mitarbeiter.csv?von=&bis=). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const von = req.nextUrl.searchParams.get("von");
  const bis = req.nextUrl.searchParams.get("bis");
  const rows = await mitarbeiterReport(von, bis);
  return csvResponse(
    rows as unknown as Array<Record<string, unknown>>,
    ["mitarbeiter", "sekunden", "buchungen"],
    "mitarbeiterzeiten.csv"
  );
}
