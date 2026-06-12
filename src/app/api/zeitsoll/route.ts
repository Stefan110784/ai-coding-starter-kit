import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditFeldDiff, auditEintrag } from "@/lib/audit";
import { sollVorschlag } from "@/lib/zeiterfassungsgrad";

/**
 * Team-Soll-Anwesenheit je Monat (KF3-35) — eine Zahl pro Monat, kein
 * Mitarbeiter-Bezug. Kein DELETE: Korrektur durch erneutes PUT (Audit-Spur).
 */

const MONAT_RX = /^\d{4}-(0[1-9]|1[0-2])$/;

const putSchema = z.object({
  monat: z.string().regex(MONAT_RX, "monat als JJJJ-MM"),
  // Obergrenze fängt Tippfehler (3 MA × ~173 h ≈ 520 h realistisch)
  sollStunden: z.number().positive().max(1000),
  bemerkung: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const monat = req.nextUrl.searchParams.get("monat") ?? "";
  if (!MONAT_RX.test(monat)) return err("monat als JJJJ-MM erforderlich", 422);

  const [soll, mitarbeiter] = await Promise.all([
    prisma.zeitSollMonat.findUnique({ where: { monat } }),
    prisma.mitarbeiter.findMany({
      where: { status: "aktiv", wochenstunden: { not: null } },
      select: { wochenstunden: true },
    }),
  ]);
  return ok({
    monat,
    sollStunden: soll?.sollStunden ?? null,
    bemerkung: soll?.bemerkung ?? null,
    // feiertagsblinder Vorschlag — nur Vorbelegung für den Pflege-Dialog
    vorschlagStunden: sollVorschlag(
      mitarbeiter.map((m) => m.wochenstunden as number),
      monat
    ),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");
  const { monat, sollStunden, bemerkung } = parsed.data;

  try {
    const soll = await prisma.$transaction(async (tx) => {
      const alt = await tx.zeitSollMonat.findUnique({ where: { monat } });
      const neu = await tx.zeitSollMonat.upsert({
        where: { monat },
        update: { sollStunden, bemerkung: bemerkung ?? null },
        create: { monat, sollStunden, bemerkung },
      });
      if (alt) {
        await auditFeldDiff(tx, "zeitSollMonat", neu.id, auth.benutzer.id, alt, {
          sollStunden,
          bemerkung: bemerkung ?? null,
        }, ["sollStunden", "bemerkung"]);
      } else {
        await auditEintrag(tx, {
          entitaet: "zeitSollMonat",
          entitaetId: neu.id,
          aktion: "erstellt",
          kontext: { monat, sollStunden },
          benutzerId: auth.benutzer.id,
        });
      }
      return neu;
    });
    return ok(soll);
  } catch (e) {
    return handlePrismaError(e);
  }
}
