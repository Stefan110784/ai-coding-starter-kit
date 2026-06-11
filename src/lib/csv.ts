/** CSV-Export im V2-Format: Semikolon-getrennt, UTF-8, attachment. */
import { NextResponse } from "next/server";

function feldWert(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  const s = String(wert);
  // Quoting nur wenn nötig (Python csv QUOTE_MINIMAL)
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function csvResponse(
  rows: Array<Record<string, unknown>>,
  felder: string[],
  dateiname: string
): NextResponse {
  const zeilen = [felder.join(";")];
  for (const row of rows) {
    zeilen.push(felder.map((f) => feldWert(row[f])).join(";"));
  }
  return new NextResponse(zeilen.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dateiname}"`,
    },
  });
}
