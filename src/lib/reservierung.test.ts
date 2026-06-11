import { describe, it, expect } from "vitest";
import { effektiverBestand } from "./reservierung";

describe("effektiverBestand", () => {
  it("zieht fremde Reservierungen ab und klemmt auf 0", () => {
    const bestand = new Map([["A", 10], ["B", 3]]);
    const reserviert = new Map([["A", 4], ["B", 5], ["C", 2]]);
    const eff = effektiverBestand(bestand, reserviert);
    expect(eff.get("A")).toBe(6);
    expect(eff.get("B")).toBe(0); // geklemmt, nicht −2
    expect(eff.get("C")).toBe(0); // reserviert ohne Bestand
  });

  it("lässt die Eingabe-Map unverändert (reine Funktion)", () => {
    const bestand = new Map([["A", 10]]);
    effektiverBestand(bestand, new Map([["A", 4]]));
    expect(bestand.get("A")).toBe(10);
  });

  it("ignoriert Reservierungs-Rauschen unterhalb der Float-Toleranz", () => {
    const eff = effektiverBestand(new Map([["A", 1]]), new Map([["A", 1e-12]]));
    expect(eff.get("A")).toBe(1);
  });
});
