import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";

const createSchema = z.object({
  name: z.string().min(1),
  kontakt: z.string().optional(),
  email: z.string().email().optional(),
  telefon: z.string().optional(),
  lieferzeitTage: z.number().int().min(0).default(7),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const lieferanten = await prisma.lieferant.findMany({
    where: { aktiv: true },
    include: {
      artikel: {
        include: { artikel: { select: { artikelnummer: true, bezeichnung: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return ok(lieferanten);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  if (auth.benutzer.rolle !== "admin") return err("Keine Berechtigung", 403);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const lieferant = await prisma.lieferant.create({ data: parsed.data });
  return ok(lieferant, 201);
}
