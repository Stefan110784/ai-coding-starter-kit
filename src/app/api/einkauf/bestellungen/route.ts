import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";
import { effektiverTermin, gelieferteMengen, terminAmpel } from "@/lib/bestellung";

/** Bestellungen (Anforderung Kap. 3; KF3-29). */

const positionSchema = z.object({
  artikelnummer: z.string().min(1).max(100),
  menge: z.number().positive().max(1_000_000),
  // min(0): Stammdaten erlauben 0-€-Preise (z. B. Beistellware); max = Decimal(10,4)
  preis: z.number().min(0).max(999_999.9999).optional(),
  vorschlagsmenge: z.number().positive().max(1_000_000).optional(),
  uebersteuerungsGrund: z.string().trim().max(2000).optional(),
  zugesagtTermin: z.string().datetime().optional(),
  auftragId: z.string().uuid().optional(),
});

const createSchema = z.object({
  lieferantId: z.string().uuid(),
  status: z.enum(["angefragt", "bestellt"]).default("angefragt"),
  zugesagtTermin: z.string().datetime().optional(),
  bemerkung: z.string().trim().max(2000).optional(),
  positionen: z.array(positionSchema).min(1, "Mindestens eine Position").max(200),
});

const OFFENE_STATUS = ["angefragt", "bestellt", "teilgeliefert"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "einkauf");
  if ("status" in auth) return auth;

  const filter = req.nextUrl.searchParams.get("status"); // "offen" | "alle"
  const bestellungen = await prisma.bestellung.findMany({
    where: filter === "alle" ? {} : { status: { in: [...OFFENE_STATUS] } },
    include: {
      lieferant: { select: { id: true, name: true, lieferzeitTage: true } },
      positionen: {
        include: { artikel: { select: { bezeichnung: true, einheit: true } } },
        orderBy: { posNr: "asc" },
      },
    },
    orderBy: { nr: "desc" },
    take: 200,
  });

  const geliefert = await gelieferteMengen(
    prisma,
    bestellungen.flatMap((b) => b.positionen.map((p) => p.id))
  );

  const heute = new Date();
  const result = bestellungen.map((b) => {
    const positionen = b.positionen.map((p) => {
      const gelieferteMenge = geliefert.get(p.id) ?? 0;
      const rest = Math.max(0, p.menge - gelieferteMenge);
      const termin = effektiverTermin(p, b);
      return {
        ...p,
        preis: p.preis != null ? Number(p.preis) : null,
        geliefert: gelieferteMenge,
        rest,
        effektiverTermin: termin,
        // Beendete Bestellungen (auch Kurzschluss mit Restmenge) sind nicht überfällig
        ampel: ["storniert", "abgeschlossen"].includes(b.status)
          ? "gruen"
          : terminAmpel(termin, rest, heute),
      };
    });
    const stufen = positionen.map((p) => p.ampel);
    const ampel = stufen.includes("rot") ? "rot" : stufen.includes("gelb") ? "gelb" : "gruen";
    return { ...b, positionen, ampel };
  });

  return ok(result);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "einkauf.bestellen");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  // EOQ-Übersteuerung nur mit Begründung (Anforderung Kap. 3)
  for (const p of parsed.data.positionen) {
    if (p.vorschlagsmenge != null && p.menge !== p.vorschlagsmenge && !p.uebersteuerungsGrund) {
      return err(`Position ${p.artikelnummer}: Abweichung vom Vorschlag braucht eine Begründung`);
    }
  }

  const { positionen, zugesagtTermin, ...kopf } = parsed.data;

  try {
    const bestellung = await prisma.$transaction(async (tx) => {
      const angelegt = await tx.bestellung.create({
        data: {
          ...kopf,
          zugesagtTermin: zugesagtTermin ? new Date(zugesagtTermin) : undefined,
          bestelltAm: kopf.status === "bestellt" ? new Date() : undefined,
          angelegtVonId: auth.benutzer.id,
          positionen: {
            create: positionen.map((p, i) => ({
              posNr: i + 1,
              artikelnummer: p.artikelnummer,
              menge: p.menge,
              preis: p.preis,
              vorschlagsmenge: p.vorschlagsmenge,
              uebersteuerungsGrund: p.uebersteuerungsGrund,
              zugesagtTermin: p.zugesagtTermin ? new Date(p.zugesagtTermin) : undefined,
              auftragId: p.auftragId,
            })),
          },
        },
        include: { positionen: true, lieferant: { select: { name: true } } },
      });

      await auditEintrag(tx, {
        entitaet: "bestellung",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: {
          nr: angelegt.nr,
          lieferant: angelegt.lieferant.name,
          positionen: angelegt.positionen.length,
        },
        benutzerId: auth.benutzer.id,
      });

      return angelegt;
    });

    return ok(bestellung, 201);
  } catch (e) {
    return handlePrismaError(e);
  }
}
