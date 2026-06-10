import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";

const createSchema = z.object({
  artikelnummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  langtext: z.string().optional(),
  vorgabezeit: z.number().optional(),
  einheit: z.string().default("Stk"),
  mindestbestand: z.number().optional(),
  lagerortId: z.string().uuid().optional(),
  produktfamilie: z.string().optional(),
  lagerplatzReihe: z.string().optional(),
  lagerplatzRegal: z.string().optional(),
  lagerplatzFach: z.string().optional(),
  lagerplatzPlatz: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q");
  const gesperrt = searchParams.get("gesperrt");

  const artikel = await prisma.artikel.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { artikelnummer: { contains: q, mode: "insensitive" } },
              { bezeichnung: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(gesperrt !== null ? { gesperrt: gesperrt === "true" } : {}),
    },
    include: { lagerort: true },
    orderBy: { artikelnummer: "asc" },
  });

  return ok(artikel);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const existing = await prisma.artikel.findUnique({
    where: { artikelnummer: parsed.data.artikelnummer },
  });
  if (existing) return err("Artikelnummer bereits vergeben", 409);

  const artikel = await prisma.artikel.create({ data: parsed.data });
  return ok(artikel, 201);
}
