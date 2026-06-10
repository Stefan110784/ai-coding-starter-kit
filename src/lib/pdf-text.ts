/**
 * PDF-Text-Extraktion mit Layout-Erhalt — Ersatz für pdfplumber
 * `extract_text(layout=True)` aus V2.
 *
 * Der Beleg-Parser hängt an der Zeilenstruktur UND an erhaltenen
 * Mehrfach-Leerzeichen (Spaltenabstände, Kunde-Heuristik `split(/\s{3,}/)`).
 * pdfjs-dist liefert Text-Items mit Koordinaten; daraus werden Zeilen
 * (Y-Gruppierung) und proportionale Leerzeichen (X-Lücken) rekonstruiert.
 */

interface TextStueck {
  str: string;
  x: number;
  y: number;
  breite: number;
}

const Y_TOLERANZ = 2; // pt — Items innerhalb dieser Spanne gelten als eine Zeile

function rekonstruiereLayout(stuecke: TextStueck[]): string {
  const mitText = stuecke.filter((s) => s.str.trim() !== "");
  if (mitText.length === 0) return "";

  // Mittlere Zeichenbreite als Maßstab für Lücken→Leerzeichen
  const gesamtBreite = mitText.reduce((s, t) => s + t.breite, 0);
  const gesamtZeichen = mitText.reduce((s, t) => s + t.str.length, 0);
  const zeichenBreite = gesamtZeichen > 0 ? gesamtBreite / gesamtZeichen : 5;

  // Nach Y gruppieren (PDF-Ursprung unten links → absteigend = oben zuerst)
  const sortiert = [...mitText].sort((a, b) => b.y - a.y || a.x - b.x);
  const zeilen: TextStueck[][] = [];
  for (const s of sortiert) {
    const letzte = zeilen[zeilen.length - 1];
    if (letzte && Math.abs(letzte[0].y - s.y) <= Y_TOLERANZ) {
      letzte.push(s);
    } else {
      zeilen.push([s]);
    }
  }

  return zeilen
    .map((zeile) => {
      zeile.sort((a, b) => a.x - b.x);
      let text = "";
      let cursorX = 0;
      for (const s of zeile) {
        if (text === "") {
          // Einrückung aus der absoluten X-Position (für Positions-Heuristiken)
          text = " ".repeat(Math.max(0, Math.round(s.x / zeichenBreite)));
        } else {
          const luecke = s.x - cursorX;
          if (luecke > zeichenBreite * 0.3) {
            text += " ".repeat(Math.max(1, Math.round(luecke / zeichenBreite)));
          }
        }
        text += s.str;
        cursorX = s.x + s.breite;
      }
      return text;
    })
    .join("\n");
}

/** Extrahiert je PDF-Seite einen layouterhaltenden Text. */
export async function extrahiereSeitenTexte(daten: Uint8Array): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const ladeTask = getDocument({ data: daten, useSystemFonts: true });
  const doc = await ladeTask.promise;
  try {
    const seiten: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const stuecke: TextStueck[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        stuecke.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          breite: item.width,
        });
      }
      seiten.push(rekonstruiereLayout(stuecke));
    }
    return seiten;
  } finally {
    await ladeTask.destroy();
  }
}
