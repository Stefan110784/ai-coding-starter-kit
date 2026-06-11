import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";

/** Grund-Katalog für Abweichungen — Basis der Pareto-Auswertung (KF3-34). */

const createSchema = z.object({
  name: z.string().trim().min(1, "Name erforderlich").max(200),
  // Whitelist statt freiem String (Tippfehler-Schutz); DB bleibt String,
  // "fuenfs" ist für das 5S-Modul (KF3-36) reserviert
  bereich: z.enum(["nacharbeit", "fehlteil", "wareneingang", "fuenfs"]).default("nacharbeit"),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const bereich = req.nextUrl.searchParams.get("bereich");
  // ?alle=1 (Verwaltung): auch deaktivierte Gründe anzeigen
  const alle = req.nextUrl.searchParams.get("alle") === "1";
  const gruende = await prisma.abweichungsGrund.findMany({
    where: { ...(alle ? {} : { aktiv: true }), ...(bereich ? { bereich } : {}) },
    orderBy: [{ aktiv: "desc" }, { name: "asc" }],
  });
  return ok(gruende);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const grund = await prisma.abweichungsGrund.create({ data: parsed.data });
    return ok(grund, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
