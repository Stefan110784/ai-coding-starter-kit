import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";

const createSchema = z.object({
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  menge: z.number().positive(),
  kunde: z.string().optional(),
  liefertermin: z.string().optional(),
  abNummer: z.string().optional(),
  notiz: z.string().optional(),
  prioritaet: z.number().int().min(0).max(2).optional(),
  positionen: z
    .array(
      z.object({
        posNr: z.number().int(),
        artikelnummer: z.string().optional(),
        bezeichnung: z.string(),
        menge: z.number().positive(),
        einheit: z.string().default("Stk"),
      })
    )
    .optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const search = searchParams.get("q");

  const auftraege = await prisma.auftrag.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { nummer: { contains: search, mode: "insensitive" } },
              { bezeichnung: { contains: search, mode: "insensitive" } },
              { abNummer: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { positionen: true },
    orderBy: { erstelltAm: "desc" },
  });

  return ok(auftraege);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const { positionen, ...data } = parsed.data;

  // App-seitige Prüfung (kein DB-Unique: V2-Altdaten enthalten doppelte Nummern)
  const existing = await prisma.auftrag.findFirst({
    where: { nummer: data.nummer },
  });
  if (existing) return err("Auftragsnummer bereits vergeben", 409);

  const auftrag = await prisma.auftrag.create({
    data: {
      ...data,
      positionen: positionen
        ? { create: positionen }
        : undefined,
    },
    include: { positionen: true },
  });

  return ok(auftrag, 201);
}
