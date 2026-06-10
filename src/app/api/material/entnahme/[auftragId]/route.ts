import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { nettobedarfFuerAuftrag, entnahmenBuchen } from "@/lib/stueckliste";

type Params = { params: Promise<{ auftragId: string }> };

/** Manuelle Entnahme-Buchung für einen Auftrag (V2: /api/material/entnahme/{id}). */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const { auftragId } = await params;
  const lagerortId = req.nextUrl.searchParams.get("lagerortId");
  if (!lagerortId) return err("lagerortId erforderlich");

  const auftrag = await prisma.auftrag.findUnique({ where: { id: auftragId } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);
  const lagerort = await prisma.lagerort.findUnique({ where: { id: lagerortId } });
  if (!lagerort) return err("Lagerort nicht gefunden", 404);

  const result = await prisma.$transaction(async (tx) => {
    const bedarf = await nettobedarfFuerAuftrag(tx, auftragId);
    const gebucht = await entnahmenBuchen(tx, auftragId, auth.benutzer.id, lagerortId, bedarf);
    return { gebucht, mangel: bedarf.mangel, mangelnd: bedarf.mangelnd };
  });

  return ok(result);
}
