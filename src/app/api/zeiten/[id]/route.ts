import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

const patchSchema = z.object({
  start: z.string().datetime().optional(),
  ende: z.string().datetime().nullable().optional(),
  kategorieId: z.string().uuid().nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "zeiten.fremde");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const start = parsed.data.start ? new Date(parsed.data.start) : undefined;
  const ende =
    parsed.data.ende === undefined
      ? undefined
      : parsed.data.ende === null
        ? null
        : new Date(parsed.data.ende);

  // Ende muss nach Start liegen (gegen vorhandenen Wert prüfen, falls nur eins gesetzt wird).
  const bestehend = await prisma.auftragszeit.findUnique({ where: { id } });
  if (!bestehend) return err("Buchung nicht gefunden", 404);
  const effStart = start ?? bestehend.start;
  const effEnde = ende === undefined ? bestehend.ende : ende;
  if (effEnde && effStart && effEnde <= effStart) {
    return err("Ende muss nach Start liegen");
  }

  try {
    const zeit = await prisma.auftragszeit.update({
      where: { id },
      data: {
        ...(start !== undefined ? { start } : {}),
        ...(ende !== undefined ? { ende } : {}),
        ...(parsed.data.kategorieId !== undefined ? { kategorieId: parsed.data.kategorieId } : {}),
      },
      include: { mitarbeiter: true, auftrag: true, kategorie: true },
    });
    return ok(zeit);
  } catch (e) {
    return handlePrismaError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "zeiten.fremde");
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    await prisma.auftragszeit.delete({ where: { id } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
