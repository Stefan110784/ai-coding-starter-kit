import { describe, it, expect } from "vitest";
import {
  berechneZeiterfassungsgrad,
  sollVorschlag,
  teamAuftragsSekundenImMonat,
} from "./zeiterfassungsgrad";
import type { Buchung } from "./zeit";

const NOW = new Date("2026-06-15T12:00:00Z");

function buchung(teil: Partial<Buchung>): Buchung {
  return {
    id: Math.random().toString(36).slice(2),
    mitarbeiterId: "m1",
    auftragId: "a1",
    start: new Date("2026-06-02T06:00:00Z"),
    ende: new Date("2026-06-02T14:00:00Z"),
    ...teil,
  };
}

describe("teamAuftragsSekundenImMonat", () => {
  it("summiert nur Buchungen des Monats und gibt NUR die Teamsumme zurück", () => {
    const summe = teamAuftragsSekundenImMonat(
      [
        buchung({}), // 8 h im Juni
        buchung({ start: new Date("2026-05-30T06:00:00Z"), ende: new Date("2026-05-30T10:00:00Z") }), // Mai
      ],
      "2026-06",
      NOW
    );
    expect(summe).toBe(8 * 3600);
  });

  it("teilt Parallelarbeit anteilig und addiert Korrekturen", () => {
    const summe = teamAuftragsSekundenImMonat(
      [
        // m1 arbeitet 2 h parallel an zwei Aufträgen → zusammen 2 h, nicht 4
        buchung({ id: "p1", start: new Date("2026-06-03T06:00:00Z"), ende: new Date("2026-06-03T08:00:00Z") }),
        buchung({ id: "p2", auftragId: "a2", start: new Date("2026-06-03T06:00:00Z"), ende: new Date("2026-06-03T08:00:00Z") }),
        buchung({ id: "k1", istKorrektur: true, korrekturMinuten: -30, ende: null }),
      ],
      "2026-06",
      NOW
    );
    expect(summe).toBe(2 * 3600 - 30 * 60);
  });
});

describe("berechneZeiterfassungsgrad", () => {
  it("ordnet den Korridor 70–85 beidseitig ein", () => {
    expect(berechneZeiterfassungsgrad("2026-06", 400 * 3600, 500).status).toBe("imKorridor"); // 80 %
    expect(berechneZeiterfassungsgrad("2026-06", 300 * 3600, 500).status).toBe("zuNiedrig"); // 60 %
    expect(berechneZeiterfassungsgrad("2026-06", 460 * 3600, 500).status).toBe("zuHoch"); // 92 %
  });

  it("ohne Soll → keinSoll mit gradProzent null; >100 % wird nicht gekappt", () => {
    expect(berechneZeiterfassungsgrad("2026-06", 100, null).status).toBe("keinSoll");
    const ueber = berechneZeiterfassungsgrad("2026-06", 550 * 3600, 500);
    expect(ueber.gradProzent).toBe(110);
    expect(ueber.status).toBe("zuHoch");
  });

  it("enthält strukturell keine Personenwerte (nur Team-Felder)", () => {
    const e = berechneZeiterfassungsgrad("2026-06", 400 * 3600, 500);
    expect(Object.keys(e).sort()).toEqual(
      ["gradProzent", "istStunden", "monat", "sollStunden", "status"].sort()
    );
  });
});

describe("sollVorschlag", () => {
  it("Σ Wochenstunden/5 × Werktage (Juni 2026 hat 22 Mo–Fr-Tage)", () => {
    expect(sollVorschlag([40, 40, 35], "2026-06")).toBe((115 / 5) * 22);
  });
  it("ohne gepflegte Wochenstunden → null", () => {
    expect(sollVorschlag([], "2026-06")).toBeNull();
  });
});
