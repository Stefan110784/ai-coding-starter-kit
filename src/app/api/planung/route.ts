import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";

const createSchema = z.object({
  auftragId: z.string().uuid(),
  mitarbeiterId: z.string().uuid(),
  geplantVon: z.string().datetime(),
  geplantBis: z.string().datetime(),
  notiz: z.string().optional(),
});

const updateSchema = createSchema.partial().omit({ auftragId: true });

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const von = searchParams.get("von");
  const bis = searchParams.get("bis");
  const mitarbeiterId = searchParams.get("mitarbeiterId");

  const zuweisungen = await prisma.auftragZuweisung.findMany({
    where: {
      ...(von || bis
        ? {
            AND: [
              von ? { geplantBis: { gte: new Date(von) } } : {},
              bis ? { geplantVon: { lte: new Date(bis) } } : {},
            ],
          }
        : {}),
      ...(mitarbeiterId ? { mitarbeiterId } : {}),
    },
    include: {
      auftrag: { select: { id: true, nummer: true, bezeichnung: true, status: true, menge: true } },
      mitarbeiter: { select: { id: true, name: true, kuerzel: true } },
    },
    orderBy: { geplantVon: "asc" },
  });

  return ok(zuweisungen);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const von = new Date(parsed.data.geplantVon);
  const bis = new Date(parsed.data.geplantBis);
  if (bis <= von) return err("geplantBis muss nach geplantVon liegen");

  const zuweisung = await prisma.auftragZuweisung.create({
    data: { ...parsed.data, geplantVon: von, geplantBis: bis },
    include: {
      auftrag: { select: { nummer: true, bezeichnung: true } },
      mitarbeiter: { select: { name: true, kuerzel: true } },
    },
  });

  return ok(zuweisung, 201);
}
