/** Gemeinsame Query-Validierung der Pareto-Routen (JSON + CSV; KF3-34). */
import { z } from "zod";

export const paretoQuerySchema = z
  .object({
    typ: z.enum(["nacharbeitsgruende", "fehlteile"]),
    von: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "von: Datum als JJJJ-MM-TT"),
    bis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "bis: Datum als JJJJ-MM-TT"),
    abwTyp: z
      .enum(["nacharbeit", "ausschuss", "reklamationKunde", "reklamationLieferant", "alle"])
      .default("nacharbeit"),
    quelle: z.enum(["bestellbezug", "mangel"]).default("bestellbezug"),
    limit: z.coerce.number().int().min(5).max(50).default(20),
  })
  .refine((q) => q.von <= q.bis, { message: "von muss vor bis liegen" });

export type ParetoQuery = z.infer<typeof paretoQuerySchema>;
