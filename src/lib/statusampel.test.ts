import { describe, it, expect } from "vitest";
import { statusampel } from "./statusampel";

// Fester Bezugspunkt: Mittwoch, 10.06.2026, 12:00 Berlin (10:00 UTC)
const HEUTE = new Date("2026-06-10T10:00:00Z");

describe("statusampel", () => {
  it("abgeschlossen → grau, unabhängig von allem anderen", () => {
    expect(
      statusampel(
        { status: "abgeschlossen", stalledMissingParts: true, promisedDate: "2026-01-01" },
        HEUTE
      )
    ).toEqual({ farbe: "grau", grund: "Abgeschlossen" });
  });

  it("Fehlteile → rot (höchste Priorität bei aktiven Aufträgen)", () => {
    expect(statusampel({ status: "laeuft", stalledMissingParts: true }, HEUTE).farbe).toBe("rot");
  });

  it("zugesagter Termin überschritten → rot", () => {
    const r = statusampel({ status: "laeuft", promisedDate: "2026-06-09T00:00:00Z" }, HEUTE);
    expect(r).toEqual({ farbe: "rot", grund: "Zugesagter Termin überschritten" });
  });

  it("Termin heute oder in ≤ 3 Tagen → gelb", () => {
    expect(statusampel({ status: "laeuft", promisedDate: "2026-06-10T00:00:00Z" }, HEUTE).farbe).toBe("gelb");
    expect(statusampel({ status: "laeuft", promisedDate: "2026-06-13T00:00:00Z" }, HEUTE).farbe).toBe("gelb");
  });

  it("Termin in > 3 Tagen → gruen", () => {
    expect(statusampel({ status: "laeuft", promisedDate: "2026-06-14T00:00:00Z" }, HEUTE).farbe).toBe("gruen");
  });

  it("offene Nacharbeit-Abweichung → gelb, auch ohne Termin", () => {
    expect(statusampel({ status: "laeuft", nacharbeitOffen: true }, HEUTE)).toEqual({
      farbe: "gelb",
      grund: "Nacharbeit offen",
    });
  });

  it("pausiert ohne weitere Befunde → gelb", () => {
    expect(statusampel({ status: "pausiert" }, HEUTE).farbe).toBe("gelb");
  });

  it("aktiv ohne Befunde → gruen", () => {
    expect(statusampel({ status: "offen" }, HEUTE)).toEqual({ farbe: "gruen", grund: "Im Plan" });
  });

  it("Vorwarn-Horizont über den Herbst-DST-Wechsel: Kalendertage statt 72 h", () => {
    // 23.10.2026 00:30 Berlin; Zeitumstellung 25.10. — Termin 26.10. ist Tag 3 → gelb
    const dstHeute = new Date("2026-10-22T22:30:00Z");
    expect(statusampel({ status: "laeuft", promisedDate: "2026-10-26T12:00:00Z" }, dstHeute).farbe).toBe("gelb");
  });

  it("Tagesgrenze Europe/Berlin: 23:30 UTC am Vortag ist bereits der Termin-Tag", () => {
    // 2026-06-09T23:30:00Z == 2026-06-10 01:30 Berlin → Termin heute → gelb, nicht rot
    expect(statusampel({ status: "laeuft", promisedDate: "2026-06-09T23:30:00Z" }, HEUTE).farbe).toBe("gelb");
  });
});
