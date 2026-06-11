/** Tests für die PDF-Textauswertung — Port der V2-Tests (test_beleg_parser.py). */
import { describe, it, expect } from "vitest";
import {
  parseText,
  produktgruppeAusPositionen,
  positionIstBasissystem,
  extrahiereAbNummer,
  type BelegPosition,
} from "./beleg-parser";

// Nachbildung des extrahierten Beleg-Texts (eine Seite) im erwarteten Layout.
const SEITE = [
  "Guestener Engineering   Auftragsbestätigung / Order Confirmation",
  "FläktGroup Wurzen GmbH        Bahnhofstr. 1, 04808 Wurzen",
  "Project no. P12418     AB2026-20104",
  "Versandtermin",
  "KW 32 / 2026 oder früher falls möglich",
  "Pos Produktnr Bezeichnung Menge Einheit",
  "1 10030A03 V-SENS 10L M12 3 Stück",
  "2 10030A07 V-SENS Endtest Protokoll 3 Stück",
  "3 Abwicklung & Versand 1 Stück",
  "Zwischensumme 1234,00 EUR",
].join("\n");

function pos(teil: Partial<BelegPosition>): BelegPosition {
  return { pos: "1", artikelnummer: "", bezeichnung: "", menge: 1, einheit: "Stück", langtext: "", ...teil };
}

describe("parseText", () => {
  it("extrahiert die Grundfelder", () => {
    const d = parseText([SEITE], "AB2026-20104");
    expect(d.abNummer).toBe("AB2026-20104");
    expect(d.nummer).toBe("P12418");
    expect(d.kunde).toBe("FläktGroup Wurzen GmbH");
    expect(d.liefertermin).toBe("KW 32 / 2026 oder früher falls möglich");
  });

  it("erkennt die Positionen", () => {
    const d = parseText([SEITE], "AB2026-20104");
    expect(d.positionen).toHaveLength(3);
    const p0 = d.positionen[0];
    expect(p0.artikelnummer).toBe("10030A03");
    expect(p0.bezeichnung).toBe("V-SENS 10L M12");
    expect(p0.menge).toBe(3);
    expect(p0.einheit).toContain("Stück");
    // Position ohne Artikelnummer
    expect(d.positionen[2].artikelnummer).toBe("");
    expect(d.positionen[2].bezeichnung).toBe("Abwicklung & Versand");
  });

  it("fällt ohne AB-Nummer im Text auf den Dateinamen-Stem zurück", () => {
    const d = parseText(["irgendein Text ohne Nummer"], "AB2026-99999");
    expect(d.abNummer).toBe("AB2026-99999");
    expect(d.nummer).toBeNull();
    expect(d.positionen).toEqual([]);
  });

  it("hängt Folgezeilen als Langtext an die letzte Position", () => {
    const seite = [
      "Pos Produktnr Bezeichnung Menge Einheit",
      "1 10030A03 V-SENS 10L M12 3 Stück",
      "   Sensor mit Spezialkabel",
      "   und Halterung",
      "Zwischensumme",
    ].join("\n");
    const d = parseText([seite], "AB2026-1");
    expect(d.positionen).toHaveLength(1);
    expect(d.positionen[0].langtext).toBe("Sensor mit Spezialkabel\nund Halterung");
  });
});

describe("produktgruppeAusPositionen", () => {
  it("Basissystem → Produktgruppe", () => {
    const positionen = [
      pos({ artikelnummer: "SFZ1", bezeichnung: "SMARTFILL Base System" }),
      pos({ artikelnummer: "SFZ2", bezeichnung: "Extension Cable" }),
    ];
    expect(produktgruppeAusPositionen(positionen)).toBe("SmartFill");
  });

  it("produktbezogen ohne Basissystem → Spare Parts", () => {
    const positionen = [pos({ artikelnummer: "10030A03", bezeichnung: "V-SENS 10L M12" })];
    expect(produktgruppeAusPositionen(positionen)).toBe("Spare Parts");
  });

  it("ohne Produktbezug → leer", () => {
    expect(produktgruppeAusPositionen([pos({ bezeichnung: "Abwicklung & Versand" })])).toBe("");
  });

  it("mehrere Basissysteme → kommagetrennt", () => {
    const positionen = [
      pos({ bezeichnung: "SMARTFILL Base System" }),
      pos({ bezeichnung: "KILNCOOLER Base Unit" }),
    ];
    expect(produktgruppeAusPositionen(positionen)).toBe("SmartFill, KilnCooler");
  });

  it("manuelle Flags haben Vorrang vor der Schlagwort-Erkennung", () => {
    const p = pos({ artikelnummer: "X1", bezeichnung: "V-SENS Spezialteil" });
    expect(positionIstBasissystem(p)).toBe(false);
    expect(positionIstBasissystem(p, { X1: true })).toBe(true);
  });

  it("Ausschluss-Schlagworte verhindern Basissystem-Erkennung", () => {
    const p = pos({ bezeichnung: "SMARTFILL Base System SPARE" });
    expect(positionIstBasissystem(p)).toBe(false);
  });
});

describe("extrahiereAbNummer", () => {
  it("findet die AB-Nummer im Dateinamen (case-insensitive, uppercased)", () => {
    expect(extrahiereAbNummer("ab2026-20104 FläktGroup.pdf")).toBe("AB2026-20104");
    expect(extrahiereAbNummer("Bestellung_XY.pdf")).toBeNull();
  });
});
