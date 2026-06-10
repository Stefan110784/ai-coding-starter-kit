import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1),
  kuerzel: z.string().min(1).max(10),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  // ?alle=true liefert auch inaktive Lagerorte (für die Verwaltung).
  const alle = req.nextUrl.searchParams.get("alle") === "true";
  const lagerorte = await prisma.lagerort.findMany({
    where: alle ? {} : { aktiv: true },
    orderBy: { name: "asc" },
  });
  return ok(lagerorte);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const lagerort = await prisma.lagerort.create({ data: parsed.data });
    return ok(lagerort, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
