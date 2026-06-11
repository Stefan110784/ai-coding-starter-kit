import { describe, it, expect } from "vitest";
import { berechneBewertung } from "./lieferantenbewertung";

const T = (s: string) => new Date(s);

describe("berechneBewertung", () => {
  it("pünktlich = letzte vervollständigende Lieferung am/vor dem Termin", () => {
    const b = berechneBewertung(
      [
        // pünktlich: Teillieferungen, letzte am Termin-Tag
        {
          menge: 10,
          termin: T("2026-06-10T00:00:00Z"),
          lieferungen: [
            { menge: 4, gebuchtAm: T("2026-06-08T08:00:00Z") },
            { menge: 6, gebuchtAm: T("2026-06-10T15:00:00Z") },
          ],
        },
        // zu spät
        { menge: 5, termin: T("2026-06-01T00:00:00Z"), lieferungen: [{ menge: 5, gebuchtAm: T("2026-06-03T08:00:00Z") }] },
      ],
      []
    );
    expect(b.termintreueBasis).toBe(2);
    expect(b.termintreueProzent).toBe(50);
  });

  it("offene oder terminlose Positionen zählen nicht zur Basis", () => {
    const b = berechneBewertung(
      [
        { menge: 10, termin: T("2026-06-10"), lieferungen: [{ menge: 4, gebuchtAm: T("2026-06-09") }] }, // Rest offen
        { menge: 5, termin: null, lieferungen: [{ menge: 5, gebuchtAm: T("2026-06-09") }] }, // kein Termin
      ],
      []
    );
    expect(b.termintreueBasis).toBe(0);
    expect(b.termintreueProzent).toBeNull();
  });

  it("Qualität = Anteil ok an allen Eingangsprüfungen", () => {
    const b = berechneBewertung([], ["ok", "ok", "abweichend"]);
    expect(b.qualitaetBasis).toBe(3);
    expect(b.qualitaetProzent).toBe(66.7);
  });

  it("ohne Daten → null statt 0 % (keine falsche Schlechtbewertung)", () => {
    const b = berechneBewertung([], []);
    expect(b.termintreueProzent).toBeNull();
    expect(b.qualitaetProzent).toBeNull();
  });
});
