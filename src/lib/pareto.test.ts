import { describe, it, expect } from "vitest";
import { paretoBerechnen } from "./pareto";

describe("paretoBerechnen", () => {
  it("sortiert absteigend und kumuliert die Prozente", () => {
    const e = paretoBerechnen([
      { key: "a", label: "Maßfehler", anzahl: 6 },
      { key: "b", label: "Kratzer", anzahl: 3 },
      { key: "c", label: "Fehlteil", anzahl: 1 },
    ]);
    expect(e.gesamt).toBe(10);
    expect(e.positionen.map((p) => p.key)).toEqual(["a", "b", "c"]);
    expect(e.positionen[0]).toMatchObject({ prozent: 60, kumProzent: 60 });
    expect(e.positionen[1]).toMatchObject({ prozent: 30, kumProzent: 90 });
    expect(e.positionen[2].kumProzent).toBe(100);
  });

  it("fasst jenseits des Limits zu Sonstige zusammen und lässt Nullzeilen weg", () => {
    const e = paretoBerechnen(
      [
        { key: "a", label: "A", anzahl: 5 },
        { key: "b", label: "B", anzahl: 4 },
        { key: "c", label: "C", anzahl: 2 },
        { key: "d", label: "D", anzahl: 0 },
      ],
      2
    );
    expect(e.positionen).toHaveLength(2);
    expect(e.sonstigeAnzahl).toBe(2);
    expect(e.gesamt).toBe(11);
  });

  it("bei Gleichstand alphabetisch, leere Zählung → gesamt 0", () => {
    const e = paretoBerechnen([
      { key: "x", label: "Zeta", anzahl: 2 },
      { key: "y", label: "Alpha", anzahl: 2 },
    ]);
    expect(e.positionen.map((p) => p.label)).toEqual(["Alpha", "Zeta"]);
    expect(paretoBerechnen([]).gesamt).toBe(0);
  });
});
