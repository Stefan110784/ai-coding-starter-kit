import { NextRequest } from "next/server";
import { requireAdmin, ok } from "@/lib/api-helpers";
import { RECHTE_KATALOG } from "@/lib/rechte";

/** Katalog aller vergebbaren Rechte (Seiten + Funktionen) für die Admin-UI. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;
  return ok(RECHTE_KATALOG);
}
