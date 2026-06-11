import { describe, it, expect } from "vitest";
import { feldDiffs, auditWert } from "./audit";

const ALT = {
  notiz: "alte Notiz",
  reworkRequired: false,
  promisedDate: new Date("2026-06-15T00:00:00Z"),
  stallDays: null,
  menge: 5,
};

describe("auditWert", () => {
  it("normalisiert leer/null/undefined auf null", () => {
    expect(auditWert(undefined)).toBeNull();
    expect(auditWert(null)).toBeNull();
    expect(auditWert("")).toBeNull();
  });

  it("formatiert Datum als ISO, Rest als String", () => {
    expect(auditWert(new Date("2026-06-15T00:00:00Z"))).toBe("2026-06-15T00:00:00.000Z");
    expect(auditWert(false)).toBe("false");
    expect(auditWert(5)).toBe("5");
  });
});

describe("feldDiffs", () => {
  it("liefert nur tatsächlich geänderte Felder", () => {
    const events = feldDiffs("auftrag", "a1", "u1", ALT, { notiz: "neue Notiz", menge: 5 }, [
      "notiz",
      "menge",
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entitaet: "auftrag",
      entitaetId: "a1",
      aktion: "feldAenderung",
      feld: "notiz",
      altWert: "alte Notiz",
      neuWert: "neue Notiz",
      benutzerId: "u1",
    });
  });

  it("ignoriert Felder, die im Update fehlen (partielles PATCH)", () => {
    expect(feldDiffs("auftrag", "a1", "u1", ALT, {}, ["notiz", "menge"])).toHaveLength(0);
    expect(
      feldDiffs("auftrag", "a1", "u1", ALT, { notiz: undefined }, ["notiz"])
    ).toHaveLength(0);
  });

  it("erkennt Boolean- und Datums-Änderungen über die String-Normalisierung", () => {
    const events = feldDiffs(
      "auftrag",
      "a1",
      null,
      ALT,
      { reworkRequired: true, promisedDate: new Date("2026-06-20T00:00:00Z") },
      ["reworkRequired", "promisedDate"]
    );
    expect(events.map((e) => e.feld).sort()).toEqual(["promisedDate", "reworkRequired"]);
    expect(events.find((e) => e.feld === "reworkRequired")).toMatchObject({
      altWert: "false",
      neuWert: "true",
      benutzerId: null,
    });
  });

  it("null → Wert und Wert → null werden erfasst, null → null nicht", () => {
    expect(feldDiffs("a", "1", null, ALT, { stallDays: 4 }, ["stallDays"])).toHaveLength(1);
    expect(feldDiffs("a", "1", null, ALT, { stallDays: null }, ["stallDays"])).toHaveLength(0);
    expect(feldDiffs("a", "1", null, ALT, { notiz: null }, ["notiz"])).toHaveLength(1);
  });
});
