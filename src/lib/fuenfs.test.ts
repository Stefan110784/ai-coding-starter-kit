import { describe, it, expect } from "vitest";
import { abschlussFehler, scoreProzent } from "./fuenfs";

describe("scoreProzent", () => {
  it("erreicht/(2×bewertet), n. a. zählt nicht", () => {
    expect(
      scoreProzent([
        { punkte: 2, nichtAnwendbar: false },
        { punkte: 1, nichtAnwendbar: false },
        { punkte: 0, nichtAnwendbar: false },
        { punkte: null, nichtAnwendbar: true },
      ])
    ).toBe(50);
  });
  it("ohne bewertete Punkte → null", () => {
    expect(scoreProzent([{ punkte: null, nichtAnwendbar: true }])).toBeNull();
  });
});

describe("abschlussFehler", () => {
  it("meldet unbewertete Punkte", () => {
    expect(
      abschlussFehler([
        { punkte: 2, nichtAnwendbar: false },
        { punkte: null, nichtAnwendbar: false },
      ])
    ).toContain("1 Punkt");
  });
  it("alles n. a. → Fehler; vollständig bewertet → null", () => {
    expect(abschlussFehler([{ punkte: null, nichtAnwendbar: true }])).toContain("Mindestens");
    expect(abschlussFehler([{ punkte: 1, nichtAnwendbar: false }])).toBeNull();
  });
});
