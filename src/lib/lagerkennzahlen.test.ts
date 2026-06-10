import { describe, it, expect } from "vitest";
import { berechneLagerkennzahlen } from "@/lib/lagerkennzahlen";

describe("berechneLagerkennzahlen", () => {
  it("berechnet Ø-Bestand, Umschlag und Lagerdauer im Standardfall (365 Tage)", () => {
    const k = berechneLagerkennzahlen({
      anfangsbestand: 80,
      endbestand: 120,
      verbrauchImZeitraum: 600,
      zeitraumTage: 365,
    });
    expect(k.durchschnittsbestand).toBe(100); // (80 + 120) / 2
    expect(k.jahresverbrauch).toBe(600); // bereits ein Jahr
    expect(k.umschlagshaeufigkeit).toBe(6); // 600 / 100
    expect(k.lagerdauerTage).toBe(61); // 365 / 6 ≈ 60,8
  });

  it("rechnet den Verbrauch auf ein Jahr hoch", () => {
    const k = berechneLagerkennzahlen({
      anfangsbestand: 100,
      endbestand: 100,
      verbrauchImZeitraum: 50,
      zeitraumTage: 30,
    });
    // 50 / 30 * 365 ≈ 608,3
    expect(k.jahresverbrauch).toBe(608.3);
    expect(k.umschlagshaeufigkeit).toBe(6.08);
  });

  it("liefert null für Umschlag und Lagerdauer bei Ø-Bestand 0", () => {
    const k = berechneLagerkennzahlen({
      anfangsbestand: 0,
      endbestand: 0,
      verbrauchImZeitraum: 10,
      zeitraumTage: 365,
    });
    expect(k.durchschnittsbestand).toBe(0);
    expect(k.umschlagshaeufigkeit).toBeNull();
    expect(k.lagerdauerTage).toBeNull();
  });
});
