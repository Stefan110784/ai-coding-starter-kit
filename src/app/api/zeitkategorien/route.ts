import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1),
  sortorder: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const kategorien = await prisma.zeitkategorie.findMany({
    orderBy: [{ sortorder: "asc" }, { name: "asc" }],
  });
  return ok(kategorien);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const kat = await prisma.zeitkategorie.create({
      data: { name: parsed.data.name, sortorder: parsed.data.sortorder ?? 0 },
    });
    return ok(kat, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
