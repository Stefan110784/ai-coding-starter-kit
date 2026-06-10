import { describe, it, expect } from "vitest";
import { anteiligeDauer, gebuchteZeitJeAuftrag, type Buchung } from "./zeit";

const T0 = new Date("2026-06-10T08:00:00Z");
const NOW = new Date("2026-06-10T12:00:00Z");

function um(minuten: number): Date {
  return new Date(T0.getTime() + minuten * 60000);
}

function buchung(teil: Partial<Buchung> & { id: string }): Buchung {
  return { mitarbeiterId: "M1", auftragId: "A1", start: T0, ende: um(60), ...teil };
}

describe("anteiligeDauer", () => {
  it("einzelne Buchung = volle Dauer", () => {
    const r = anteiligeDauer([buchung({ id: "b1" })], NOW);
    expect(r.get("b1")).toBe(3600);
  });

  it("zwei voll parallele Buchungen teilen sich die Zeit", () => {
    const r = anteiligeDauer(
      [buchung({ id: "b1" }), buchung({ id: "b2", auftragId: "A2" })],
      NOW
    );
    expect(r.get("b1")).toBe(1800);
    expect(r.get("b2")).toBe(1800);
    // Summe bleibt die Wanduhr-Zeit
    expect((r.get("b1") ?? 0) + (r.get("b2") ?? 0)).toBe(3600);
  });

  it("teilweise Überlappung wird abschnittsweise aufgeteilt", () => {
    // b1: 0–60, b2: 30–90 → b1 = 30 + 15, b2 = 15 + 30
    const r = anteiligeDauer(
      [buchung({ id: "b1" }), buchung({ id: "b2", start: um(30), ende: um(90) })],
      NOW
    );
    expect(r.get("b1")).toBe(45 * 60);
    expect(r.get("b2")).toBe(45 * 60);
  });

  it("Nachträge zählen voll und beeinflussen die Aufteilung nicht", () => {
    const r = anteiligeDauer(
      [buchung({ id: "b1" }), buchung({ id: "n1", istNachtrag: true })],
      NOW
    );
    expect(r.get("b1")).toBe(3600);
    expect(r.get("n1")).toBe(3600);
  });

  it("laufende Buchung wird bis now gerechnet", () => {
    const r = anteiligeDauer([buchung({ id: "b1", ende: null })], NOW);
    expect(r.get("b1")).toBe(4 * 3600);
  });

  it("ungültige Buchung (ende <= start) zählt 0", () => {
    const r = anteiligeDauer([buchung({ id: "b1", ende: T0 })], NOW);
    expect(r.get("b1")).toBe(0);
  });
});

describe("gebuchteZeitJeAuftrag", () => {
  it("teilt pro Mitarbeiter auf und summiert je Auftrag", () => {
    // M1 parallel auf A1+A2 (je 30 min), M2 voll auf A1 (60 min)
    const r = gebuchteZeitJeAuftrag(
      [
        buchung({ id: "b1", auftragId: "A1" }),
        buchung({ id: "b2", auftragId: "A2" }),
        buchung({ id: "b3", mitarbeiterId: "M2", auftragId: "A1" }),
      ],
      NOW
    );
    expect(r.get("A1")).toBe(1800 + 3600);
    expect(r.get("A2")).toBe(1800);
  });

  it("Korrekturbuchungen addieren ±Minuten", () => {
    const r = gebuchteZeitJeAuftrag(
      [
        buchung({ id: "b1", auftragId: "A1" }),
        buchung({ id: "k1", auftragId: "A1", istKorrektur: true, korrekturMinuten: -10, start: null, ende: null }),
      ],
      NOW
    );
    expect(r.get("A1")).toBe(3600 - 600);
  });
});
