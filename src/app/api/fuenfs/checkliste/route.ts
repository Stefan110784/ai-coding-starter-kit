import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";

/** Globale 5S-Checklisten-Vorlage (KF3-36) — pflegbar, kein DELETE. */

const KATEGORIEN = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"] as const;

const createSchema = z.object({
  kategorie: z.enum(KATEGORIEN),
  text: z.string().trim().min(1, "Text erforderlich").max(300),
  sortorder: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "fuenfs");
  if ("status" in auth) return auth;

  const alle = req.nextUrl.searchParams.get("alle") === "1";
  const punkte = await prisma.fuenfSChecklistenPunkt.findMany({
    where: alle ? {} : { aktiv: true },
    orderBy: [{ sortorder: "asc" }],
  });
  return ok(punkte);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const punkt = await prisma.$transaction(async (tx) => {
      const angelegt = await tx.fuenfSChecklistenPunkt.create({ data: parsed.data });
      await auditEintrag(tx, {
        entitaet: "fuenfsChecklistenPunkt",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: { kategorie: angelegt.kategorie, text: angelegt.text },
        benutzerId: auth.benutzer.id,
      });
      return angelegt;
    });
    return ok(punkt, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
