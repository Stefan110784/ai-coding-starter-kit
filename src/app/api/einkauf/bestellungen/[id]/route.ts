import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag, auditFeldDiff } from "@/lib/audit";
import { effektiverTermin, gelieferteMengen, terminAmpel } from "@/lib/bestellung";

/** Einzelne Bestellung: Detail + Statusführung (KF3-29). */

const updateSchema = z.object({
  status: z.enum(["angefragt", "bestellt", "teilgeliefert", "abgeschlossen", "storniert"]).optional(),
  zugesagtTermin: z.string().datetime().optional().nullable(),
  bemerkung: z.string().trim().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "einkauf");
  if ("status" in auth) return auth;

  const { id } = await params;
  const b = await prisma.bestellung.findUnique({
    where: { id },
    include: {
      lieferant: { select: { id: true, name: true, lieferzeitTage: true } },
      angelegtVon: { select: { username: true, name: true } },
      positionen: {
        include: {
          artikel: { select: { bezeichnung: true, einheit: true } },
          auftrag: { select: { nummer: true } },
        },
        orderBy: { posNr: "asc" },
      },
    },
  });
  if (!b) return err("Bestellung nicht gefunden", 404);

  const geliefert = await gelieferteMengen(prisma, b.positionen.map((p) => p.id));
  const heute = new Date();
  const positionen = b.positionen.map((p) => {
    const g = geliefert.get(p.id) ?? 0;
    const rest = Math.max(0, p.menge - g);
    const termin = effektiverTermin(p, b);
    return {
      ...p,
      preis: p.preis != null ? Number(p.preis) : null,
      geliefert: g,
      rest,
      effektiverTermin: termin,
      ampel: b.status === "storniert" ? "gruen" : terminAmpel(termin, rest, heute),
    };
  });

  return ok({ ...b, positionen });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "einkauf.bestellen");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const alt = await tx.bestellung.findUnique({
        where: { id },
        include: { positionen: { select: { id: true, menge: true } } },
      });
      if (!alt) throw new NotFound();

      const { status: neuerStatus, zugesagtTermin, ...felder } = parsed.data;
      const data: Record<string, unknown> = { ...felder };
      if ("zugesagtTermin" in parsed.data) {
        data.zugesagtTermin = zugesagtTermin ? new Date(zugesagtTermin) : null;
      }

      if (neuerStatus !== undefined && neuerStatus !== alt.status) {
        // Manueller Kurzschluss mit Restmenge bzw. Storno → Pflicht-Bemerkung
        if (neuerStatus === "abgeschlossen" || neuerStatus === "storniert") {
          const geliefert = await gelieferteMengen(tx, alt.positionen.map((p) => p.id));
          const rest = alt.positionen.some((p) => (geliefert.get(p.id) ?? 0) < p.menge);
          if (rest && !(felder.bemerkung ?? alt.bemerkung)) {
            throw new BemerkungFehlt();
          }
          if (neuerStatus === "abgeschlossen") data.abgeschlossenAm = new Date();
        }
        if (neuerStatus === "bestellt" && alt.bestelltAm === null) data.bestelltAm = new Date();
        if (neuerStatus !== "abgeschlossen") data.abgeschlossenAm = null;
        data.status = neuerStatus;

        await auditEintrag(tx, {
          entitaet: "bestellung",
          entitaetId: id,
          aktion: "statuswechsel",
          feld: "status",
          altWert: alt.status,
          neuWert: neuerStatus,
          kontext: { nr: alt.nr },
          benutzerId: auth.benutzer.id,
        });
      }

      const neuFuerAudit: Record<string, unknown> = { ...felder };
      if ("zugesagtTermin" in parsed.data) neuFuerAudit.zugesagtTermin = data.zugesagtTermin;
      await auditFeldDiff(tx, "bestellung", id, auth.benutzer.id, alt, neuFuerAudit, [
        "zugesagtTermin",
        "bemerkung",
      ]);

      return tx.bestellung.update({ where: { id }, data });
    });

    return ok(updated);
  } catch (e) {
    if (e instanceof NotFound) return err("Bestellung nicht gefunden", 404);
    if (e instanceof BemerkungFehlt) {
      return err("Abschluss/Storno mit offener Restmenge braucht eine Bemerkung", 400);
    }
    return handlePrismaError(e);
  }
}

class NotFound extends Error {}
class BemerkungFehlt extends Error {}
