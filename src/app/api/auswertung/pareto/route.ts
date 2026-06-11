import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { paretoBerechnen } from "@/lib/pareto";
import { ladeParetoFehlteile, ladeParetoGruende } from "@/lib/pareto-daten";
import { paretoQuerySchema } from "./params";

/** Pareto-Auswertung (KF3-34): Nacharbeitsgründe bzw. Fehlteile, 80/20. */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const parsed = paretoQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Parameter");
  const q = parsed.data;

  const roh =
    q.typ === "nacharbeitsgruende"
      ? await ladeParetoGruende(prisma, q.von, q.bis, q.abwTyp)
      : await ladeParetoFehlteile(prisma, q.von, q.bis, q.quelle);

  const ergebnis = paretoBerechnen(roh.zaehlung, q.limit);
  return ok({ ...ergebnis, ohneGrund: roh.ohneGrund });
}
