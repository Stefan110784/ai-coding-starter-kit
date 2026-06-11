import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

type Params = { params: Promise<{ auftragId: string; artikelnummer: string }> };

const schema = z.object({ abgehakt: z.boolean() });

/** Abhak-Status einer Position setzen (V2: kommissionierung_check_setzen, Recht lager).
 *  Bucht nichts — die Entnahme passiert erst beim Statuswechsel auf "kommissioniert". */
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lager");
  if ("status" in auth) return auth;

  const { auftragId, artikelnummer } = await params;
  const nr = decodeURIComponent(artikelnummer);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const { abgehakt } = parsed.data;
  try {
    const check = await prisma.kommissionierCheck.upsert({
      where: { auftragId_artikelnummer: { auftragId, artikelnummer: nr } },
      create: {
        auftragId,
        artikelnummer: nr,
        abgehakt,
        abgehaktAm: abgehakt ? new Date() : null,
        abgehaktVonId: abgehakt ? auth.benutzer.id : null,
      },
      update: {
        abgehakt,
        abgehaktAm: abgehakt ? new Date() : null,
        abgehaktVonId: abgehakt ? auth.benutzer.id : null,
      },
    });
    return ok({ abgehakt: check.abgehakt });
  } catch (e) {
    return handlePrismaError(e);
  }
}
