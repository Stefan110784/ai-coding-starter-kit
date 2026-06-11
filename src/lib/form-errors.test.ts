import { describe, it, expect } from "vitest";
import { z } from "zod";
import { feldFehler } from "@/lib/form-errors";

const schema = z.object({
  nummer: z.string().min(1, "Pflichtfeld"),
  menge: z.number().positive("Muss > 0 sein"),
});

describe("feldFehler", () => {
  it("liefert je Feld die erste Meldung", () => {
    const res = schema.safeParse({ nummer: "", menge: -1 });
    expect(res.success).toBe(false);
    if (!res.success) {
      const f = feldFehler(res.error);
      expect(f.nummer).toBe("Pflichtfeld");
      expect(f.menge).toBe("Muss > 0 sein");
    }
  });

  it("ist leer bei gültiger Eingabe", () => {
    const res = schema.safeParse({ nummer: "A1", menge: 5 });
    expect(res.success).toBe(true);
  });
});
