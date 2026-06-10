import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { zugewieseneMitarbeiter } from "@/lib/arbeitsvorrat";

type Params = { params: Promise<{ id: string }> };

/** Zugewiesene Mitarbeiter eines Auftrags (V2: GET /{id}/mitarbeiter, Recht verwaltung). */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id } = await params;
  const auftrag = await prisma.auftrag.findUnique({ where: { id } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);
  if (auftrag.nummer.startsWith("S")) return err("S-Aufträge können nicht zugewiesen werden");

  return ok(await zugewieseneMitarbeiter(id));
}
