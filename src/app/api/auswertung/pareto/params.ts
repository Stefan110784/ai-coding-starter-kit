/** Gemeinsame Query-Validierung der Pareto-Routen (JSON + CSV; KF3-34). */
import { z } from "zod";

/** Kalendarisch gültig? ("2026-02-31" passiert die Regex, ist aber keiner.) */
const istKalendertag = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const MAX_ZEITRAUM_TAGE = 730;

export const paretoQuerySchema = z
  .object({
    typ: z.enum(["nacharbeitsgruende", "fehlteile"]),
    von: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "von: Datum als JJJJ-MM-TT").refine(istKalendertag, "von: ungültiges Datum"),
    bis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "bis: Datum als JJJJ-MM-TT").refine(istKalendertag, "bis: ungültiges Datum"),
    abwTyp: z
      .enum(["nacharbeit", "ausschuss", "reklamationKunde", "reklamationLieferant", "alle"])
      .default("nacharbeit"),
    quelle: z.enum(["bestellbezug", "mangel"]).default("bestellbezug"),
    limit: z.coerce.number().int().min(5).max(50).default(20),
  })
  .refine((q) => q.von <= q.bis, { message: "von muss vor bis liegen" })
  .refine(
    (q) => (Date.parse(q.bis) - Date.parse(q.von)) / 86_400_000 <= MAX_ZEITRAUM_TAGE,
    { message: `Zeitraum auf ${MAX_ZEITRAUM_TAGE} Tage begrenzt` }
  );

export type ParetoQuery = z.infer<typeof paretoQuerySchema>;
