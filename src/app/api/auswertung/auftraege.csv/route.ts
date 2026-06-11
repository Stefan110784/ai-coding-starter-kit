import { NextRequest } from "next/server";
import { requireRecht } from "@/lib/api-helpers";
import { auftragReport } from "@/lib/auswertung";
import { csvResponse } from "@/lib/csv";

/** Nachkalkulations-CSV (V2: GET /api/auswertung/auftraege.csv). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const rows = await auftragReport();
  return csvResponse(
    rows as unknown as Array<Record<string, unknown>>,
    ["nummer", "bezeichnung", "status", "ist_sekunden", "soll_sekunden", "diff_sekunden"],
    "nachkalkulation.csv"
  );
}
