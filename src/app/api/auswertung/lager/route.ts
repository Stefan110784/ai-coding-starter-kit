import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { lagerKennzahlenAusDb, materialwertAusDb } from "@/lib/lagerkennzahlen";

/** Lagerkennzahlen (Umschlag, Ø-Bestand, Lagerdauer) für einen Zeitraum. */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const bis = sp.get("bis") ? new Date(sp.get("bis")!) : new Date();
  const von = sp.get("von")
    ? new Date(sp.get("von")!)
    : new Date(bis.getTime() - 365 * 86400000);

  if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime())) {
    return err("Ungültiger Zeitraum");
  }

  const [kennzahlen, materialwert] = await Promise.all([
    lagerKennzahlenAusDb(prisma, von, bis),
    materialwertAusDb(prisma, von, bis),
  ]);
  return ok({ ...kennzahlen, ...materialwert });
}
