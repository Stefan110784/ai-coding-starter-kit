import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, ok } from "@/lib/api-helpers";
import { bewertungJeLieferant } from "@/lib/lieferantenbewertung";

/** Lieferantenbewertung: Termintreue + Qualität, rein abgeleitet (KF3-32). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "lieferanten");
  if ("status" in auth) return auth;

  return ok(await bewertungJeLieferant(prisma));
}
