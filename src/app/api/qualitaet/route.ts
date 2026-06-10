import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";

const createSchema = z.object({
  auftragId: z.string().uuid(),
  mitarbeiterId: z.string().uuid().optional(),
  gut: z.number().min(0).default(0),
  ausschuss: z.number().min(0).default(0),
  nacharbeit: z.number().min(0).default(0),
  bemerkung: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const auftragId = req.nextUrl.searchParams.get("auftragId");

  const qualitaet = await prisma.qualitaet.findMany({
    where: auftragId ? { auftragId } : {},
    include: { mitarbeiter: true, auftrag: { select: { nummer: true, bezeichnung: true } } },
    orderBy: { zeitstempel: "desc" },
  });

  return ok(qualitaet);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  if (
    parsed.data.gut === 0 &&
    parsed.data.ausschuss === 0 &&
    parsed.data.nacharbeit === 0
  ) {
    return err("Mindestens eine Menge muss größer 0 sein");
  }

  const eintrag = await prisma.qualitaet.create({ data: parsed.data });
  return ok(eintrag, 201);
}
