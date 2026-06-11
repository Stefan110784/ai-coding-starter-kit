import { NextRequest } from "next/server";
import { requireRecht, ok } from "@/lib/api-helpers";
import { importiereBelege } from "@/lib/beleg-import";

export const maxDuration = 300;

/** Verzeichnis-Scan-Import von AB-PDFs (V2: POST /api/import/belege, Recht verwaltung). */
export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const ergebnis = await importiereBelege();
  console.log(
    `[beleg-import] quelle=${ergebnis.quelle} geprueft=${ergebnis.geprueft} ` +
      `angelegt=${ergebnis.angelegt} aktualisiert=${ergebnis.aktualisiert} ` +
      `uebersprungen=${ergebnis.uebersprungen} fehler=${ergebnis.fehler.length}` +
      (ergebnis.fehlerText ? ` (${ergebnis.fehlerText})` : "")
  );
  return ok(ergebnis);
}
