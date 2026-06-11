import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";
import { abschlussFehler, scoreProzent } from "@/lib/fuenfs";
import * as storage from "@/lib/storage";

const patchSchema = z
  .object({
    bemerkung: z.string().trim().max(2000).nullable().optional(),
    status: z.literal("abgeschlossen").optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Keine Änderung übergeben" });

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs");
  if ("status" in auth) return auth;

  const { id } = await params;
  const audit = await prisma.fuenfSAudit.findUnique({
    where: { id },
    include: {
      bereich: { select: { id: true, name: true, verantwortlichId: true } },
      erstelltVon: { select: { username: true, name: true } },
      positionen: {
        orderBy: { sortorder: "asc" },
        include: {
          fotos: { select: { id: true, name: true } },
          abweichung: {
            select: { id: true, status: true, faelligAm: true, verantwortlich: { select: { kuerzel: true } } },
          },
        },
      },
    },
  });
  if (!audit) return err("Audit nicht gefunden", 404);
  return ok({ ...audit, liveScore: scoreProzent(audit.positionen) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs.audit");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  try {
    const audit = await prisma.$transaction(async (tx) => {
      const alt = await tx.fuenfSAudit.findUnique({
        where: { id },
        include: { positionen: { select: { punkte: true, nichtAnwendbar: true } } },
      });
      if (!alt) throw new NichtGefunden();
      if (alt.status === "abgeschlossen") throw new Abgeschlossen();

      const data: Record<string, unknown> = {};
      if (parsed.data.bemerkung !== undefined) data.bemerkung = parsed.data.bemerkung;

      if (parsed.data.status === "abgeschlossen") {
        const fehler = abschlussFehler(alt.positionen);
        if (fehler) throw new NichtFertig(fehler);
        data.status = "abgeschlossen";
        data.abgeschlossenAm = new Date();
        // Score EINFRIEREN (Trend bleibt stabil bei Vorlagen-Änderungen)
        data.scoreProzent = scoreProzent(alt.positionen);
        await auditEintrag(tx, {
          entitaet: "fuenfsAudit",
          entitaetId: id,
          aktion: "abgeschlossen",
          neuWert: String(data.scoreProzent),
          kontext: { monat: alt.monat },
          benutzerId: auth.benutzer.id,
        });
      }

      return tx.fuenfSAudit.update({ where: { id }, data });
    });
    return ok(audit);
  } catch (e) {
    if (e instanceof NichtGefunden) return err("Audit nicht gefunden", 404);
    if (e instanceof Abgeschlossen) return err("Audit ist abgeschlossen und unveränderbar", 400);
    if (e instanceof NichtFertig) return err(`Abschluss nicht möglich: ${e.message}`, 400);
    return handlePrismaError(e);
  }
}

/** Nur Entwürfe sind löschbar — abgeschlossene Audits sind ISO-Nachweis. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "fuenfs.audit");
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    // Foto-Blobs VOR dem Cascade-Delete einsammeln — sonst bleiben sie als
    // Leichen in der Ablage (Review-Befund); Statusbedingung im deleteMany
    // schließt das Race mit einem parallelen Abschluss.
    const fotos = await prisma.datei.findMany({
      where: { fuenfsPosition: { auditId: id } },
      select: { speicherpfad: true },
    });
    const res = await prisma.fuenfSAudit.deleteMany({ where: { id, status: "entwurf" } });
    if (res.count === 0) {
      const existiert = await prisma.fuenfSAudit.findUnique({ where: { id }, select: { id: true } });
      return existiert
        ? err("Abgeschlossene Audits sind ISO-Nachweis und nicht löschbar", 400)
        : err("Audit nicht gefunden", 404);
    }
    for (const f of fotos) {
      try {
        await storage.loesche(f.speicherpfad);
      } catch (e) {
        console.error("[fuenfs] Foto-Ablage nicht löschbar:", f.speicherpfad, e);
      }
    }
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}

class NichtGefunden extends Error {}
class Abgeschlossen extends Error {}
class NichtFertig extends Error {}
