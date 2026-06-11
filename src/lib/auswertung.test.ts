import { describe, it, expect, vi } from "vitest";

// kpiFuerZeitraum ist eine reine Funktion; das Modul importiert aber den Prisma-
// Client. Wir mocken ihn weg, damit der Test ohne DB läuft.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { kpiFuerZeitraum } from "@/lib/auswertung";
import type { Auftrag } from "@/generated/prisma";

/** Minimaler Auftrag mit nur den für die KPI relevanten Feldern. */
function auftrag(p: Partial<Auftrag>): Auftrag {
  return {
    reworkRequired: false,
    stalledMissingParts: false,
    stallDays: null,
    start: null,
    ende: null,
    promisedDate: null,
    kpiAusgeschlossen: false,
    ...p,
  } as Auftrag;
}

describe("kpiFuerZeitraum", () => {
  it("liefert Nullwerte, wenn keine abgeschlossenen Aufträge vorliegen", () => {
    const kpi = kpiFuerZeitraum([auftrag({ ende: null })]);
    expect(kpi.basis).toBe(0);
    expect(kpi.onTimeDeliveryRate).toBeNull();
    expect(kpi.reworkRate).toBeNull();
  });

  it("bewertet die Liefertreue an der Tagesgrenze in Europe/Berlin (Regression: vormals lokal vs. UTC)", () => {
    // ende  = 2026-06-15T22:30Z → in Berlin (Sommer, UTC+2) der 16.06. 00:30
    // promised = 2026-06-15T23:00Z → in Berlin der 16.06. 01:00
    // Beide fallen lokal auf den 16.06. → pünktlich. Mit der alten UTC-Logik
    // (promised → 15.06.) wäre der Auftrag fälschlich als verspätet gezählt worden.
    const kpi = kpiFuerZeitraum([
      auftrag({
        ende: new Date("2026-06-15T22:30:00Z"),
        promisedDate: new Date("2026-06-15T23:00:00Z"),
      }),
    ]);
    expect(kpi.basis).toBe(1);
    expect(kpi.onTimeDeliveryRate).toBe(100);
  });

  it("zählt einen klar verspäteten Auftrag als nicht liefertreu", () => {
    const kpi = kpiFuerZeitraum([
      auftrag({
        ende: new Date("2026-06-17T10:00:00Z"),
        promisedDate: new Date("2026-06-15T10:00:00Z"),
      }),
    ]);
    expect(kpi.onTimeDeliveryRate).toBe(0);
  });

  it("berechnet Nacharbeits- und Fehlteilquote über alle abgeschlossenen Aufträge", () => {
    const kpi = kpiFuerZeitraum([
      auftrag({ ende: new Date("2026-06-10T08:00:00Z"), reworkRequired: true }),
      auftrag({ ende: new Date("2026-06-10T08:00:00Z"), stalledMissingParts: true }),
      auftrag({ ende: new Date("2026-06-10T08:00:00Z") }),
      auftrag({ ende: new Date("2026-06-10T08:00:00Z") }),
    ]);
    expect(kpi.basis).toBe(4);
    expect(kpi.reworkRate).toBe(25);
    expect(kpi.missingPartsRate).toBe(25);
  });

  it("ermittelt die Durchlaufzeit aus Start- und Ende-Datum", () => {
    const kpi = kpiFuerZeitraum([
      auftrag({
        start: new Date("2026-06-10T08:00:00Z"),
        ende: new Date("2026-06-13T16:00:00Z"),
      }),
    ]);
    expect(kpi.leadTimeDaysMedian).toBe(3);
    expect(kpi.leadTimeDaysAvg).toBe(3);
  });
});
