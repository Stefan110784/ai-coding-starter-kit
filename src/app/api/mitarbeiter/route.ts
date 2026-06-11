import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import { hatRecht } from "@/lib/rechte";

const createSchema = z.object({
  name: z.string().min(1),
  kuerzel: z.string().min(1).max(5).toUpperCase(),
  status: z.enum(["aktiv", "inaktiv"]).default("aktiv"),
  // KF3-35: Grundlage für den Soll-Vorschlag des Zeiterfassungsgrads
  wochenstunden: z.number().positive().max(60).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const nurAktive = req.nextUrl.searchParams.get("aktiv") !== "false";

  const mitarbeiter = await prisma.mitarbeiter.findMany({
    where: nurAktive ? { status: "aktiv" } : {},
    include: {
      benutzer: { select: { username: true, rolle: true } },
    },
    orderBy: { name: "asc" },
  });
  // wochenstunden ist Stammdatum der Soll-Pflege (KF3-35) — nur fürs
  // Verwaltungsrecht sichtbar, nicht für alle Angemeldeten
  if (!hatRecht(auth.benutzer, "verwaltung")) {
    return ok(mitarbeiter.map(({ wochenstunden: _w, ...rest }) => rest));
  }
  return ok(mitarbeiter);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  if (auth.benutzer.rolle !== "admin") return err("Keine Berechtigung", 403);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const existing = await prisma.mitarbeiter.findUnique({
    where: { kuerzel: parsed.data.kuerzel },
  });
  if (existing) return err("Kürzel bereits vergeben", 409);

  const mitarbeiter = await prisma.mitarbeiter.create({ data: parsed.data });
  return ok(mitarbeiter, 201);
}
