import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { zugewieseneMitarbeiter } from "@/lib/arbeitsvorrat";

type Params = { params: Promise<{ id: string; mitarbeiterId: string }> };

/** Mitarbeiter dem Auftrag zuweisen (V2: POST /{id}/mitarbeiter/{mid}, Recht verwaltung). */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id, mitarbeiterId } = await params;
  const auftrag = await prisma.auftrag.findUnique({ where: { id } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);
  if (auftrag.nummer.startsWith("S")) return err("S-Aufträge können nicht zugewiesen werden");
  const mitarbeiter = await prisma.mitarbeiter.findUnique({ where: { id: mitarbeiterId } });
  if (!mitarbeiter) return err("Mitarbeiter nicht gefunden", 404);
  if (mitarbeiter.status !== "aktiv") return err("Mitarbeiter ist nicht aktiv", 422);

  try {
    await prisma.auftragMitarbeiter.upsert({
      where: { auftragId_mitarbeiterId: { auftragId: id, mitarbeiterId } },
      create: { auftragId: id, mitarbeiterId, zugewiesenVonId: auth.benutzer.id },
      update: {},
    });
    return ok(await zugewieseneMitarbeiter(id));
  } catch (e) {
    return handlePrismaError(e);
  }
}

/** Zuweisung entfernen (V2: DELETE /{id}/mitarbeiter/{mid}). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const { id, mitarbeiterId } = await params;
  try {
    await prisma.auftragMitarbeiter.delete({
      where: { auftragId_mitarbeiterId: { auftragId: id, mitarbeiterId } },
    });
    return ok(await zugewieseneMitarbeiter(id));
  } catch (e) {
    return handlePrismaError(e);
  }
}
