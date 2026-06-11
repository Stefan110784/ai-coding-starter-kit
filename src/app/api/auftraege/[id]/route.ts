import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { hatRecht } from "@/lib/rechte";
import { parseLiefertermin } from "@/lib/liefertermin";
import {
  nettobedarfFuerAuftrag,
  sollSekundenNetto,
  entnahmenBuchen,
  fertigmeldungBuchen,
  fertigmeldungStornieren,
  materialSnapshotSchreiben,
  type NettobedarfResult,
  type BedarfPosition,
} from "@/lib/stueckliste";
import { auditEintrag, auditFeldDiff } from "@/lib/audit";
import { reservierungAufloesen } from "@/lib/reservierung";
import type { Prisma } from "@/generated/prisma";

/** Felder, deren Änderung im Audit-Log landet (ISO 7.5; KF3-25). */
const AUDIT_FELDER = [
  "bezeichnung",
  "menge",
  "kunde",
  "liefertermin",
  "abNummer",
  "notiz",
  "pausengrund",
  "reworkRequired",
  "reworkReason",
  "stalledMissingParts",
  "stallDays",
  "kpiAusgeschlossen",
  "promisedDate",
  "prioritaet",
];

const updateSchema = z.object({
  bezeichnung: z.string().optional(),
  menge: z.number().positive().optional(),
  kunde: z.string().optional().nullable(),
  liefertermin: z.string().optional().nullable(),
  abNummer: z.string().optional().nullable(),
  notiz: z.string().optional().nullable(),
  pausengrund: z.string().optional().nullable(),
  status: z
    .enum(["offen", "kommissioniert", "laeuft", "pausiert", "abgeschlossen"])
    .optional(),
  reworkRequired: z.boolean().optional(),
  reworkReason: z.string().optional().nullable(),
  stalledMissingParts: z.boolean().optional(),
  stallDays: z.number().int().optional().nullable(),
  kpiAusgeschlossen: z.boolean().optional(),
  promisedDate: z.string().datetime().optional().nullable(),
  promisedDateManuell: z.boolean().optional(),
  prioritaet: z.number().int().min(0).max(2).optional(),
  // Vertriebs-Verknüpfung (KF3-37): null = lösen
  kundenauftragId: z.string().uuid().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const auftrag = await prisma.auftrag.findUnique({
    where: { id },
    include: {
      positionen: { include: { artikel: true } },
      zeiten: { include: { mitarbeiter: true, kategorie: true } },
      qualitaet: { include: { mitarbeiter: true } },
      dateien: true,
      zuweisungen: { include: { mitarbeiter: true } },
      team: { include: { mitarbeiter: { select: { id: true, name: true, kuerzel: true } } } },
      packmasse: { orderBy: { position: "asc" } },
      kundenauftrag: {
        select: { id: true, nr: true, status: true, kunde: { select: { name: true } } },
      },
    },
  });

  if (!auftrag) return err("Auftrag nicht gefunden", 404);
  return ok(auftrag);
}

class MangelError extends Error {
  constructor(public mangelnd: BedarfPosition[]) {
    super("Materialmangel");
  }
}

/** Hartes Endprüf-Gate (ISO 8.6, KF3-26): bewusst KEINE force-Umgehung. */
class PruefungFehltError extends Error {}

class KundenauftragUngueltig extends Error {}

async function ersterAktiverLagerortId(tx: Prisma.TransactionClient): Promise<string | null> {
  const erster = await tx.lagerort.findFirst({ where: { aktiv: true }, orderBy: { name: "asc" } });
  return erster?.id ?? null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  // Statusänderung erfordert das Recht auftraege.status (V2-Parität).
  if (parsed.data.status !== undefined && !hatRecht(auth.benutzer, "auftraege.status")) {
    return err("Keine Berechtigung zur Statusänderung", 403);
  }

  const lagerortParam = req.nextUrl.searchParams.get("lagerortId");
  const force = req.nextUrl.searchParams.get("force") === "true";

  const { status: neuerStatus, ...felder } = parsed.data;
  const lieferterminGeaendert = "liefertermin" in parsed.data;
  const promisedDateExplizit = "promisedDate" in parsed.data;
  const manuellFlagExplizit = "promisedDateManuell" in parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const auftrag = await tx.auftrag.findUnique({ where: { id } });
      if (!auftrag) throw new MangelNotFound();

      const data: Prisma.AuftragUncheckedUpdateInput = { ...felder };

      // --- Kundenauftrag verknüpfen/lösen (KF3-37) ---
      if ("kundenauftragId" in parsed.data && felder.kundenauftragId !== auftrag.kundenauftragId) {
        if (felder.kundenauftragId) {
          const ka = await tx.kundenauftrag.findUnique({
            where: { id: felder.kundenauftragId },
            include: { kunde: { select: { name: true } } },
          });
          if (!ka || !ka.aktiv) throw new KundenauftragUngueltig("nicht gefunden");
          if (!["neu", "freigegeben"].includes(ka.status)) {
            throw new KundenauftragUngueltig(`Status ${ka.status} erlaubt keine Verknüpfung`);
          }
          // Kundennamen nachziehen — die Relation ist ab jetzt führend
          data.kunde = ka.kunde.name;
          await auditEintrag(tx, {
            entitaet: "auftrag",
            entitaetId: id,
            aktion: "kundenauftragVerknuepft",
            neuWert: `KA-${ka.nr}`,
            kontext: { nummer: auftrag.nummer },
            benutzerId: auth.benutzer.id,
          });
        } else {
          // Lösen: kunde-String bleibt als Historie stehen
          const altKa = auftrag.kundenauftragId
            ? await tx.kundenauftrag.findUnique({ where: { id: auftrag.kundenauftragId } })
            : null;
          await auditEintrag(tx, {
            entitaet: "auftrag",
            entitaetId: id,
            aktion: "kundenauftragGeloest",
            altWert: altKa ? `KA-${altKa.nr}` : null,
            kontext: { nummer: auftrag.nummer },
            benutzerId: auth.benutzer.id,
          });
        }
      }

      // --- Auto-Ableitung promisedDate aus Liefertermin (V2: auftraege.py:268-276) ---
      const effLiefertermin = lieferterminGeaendert ? (felder.liefertermin ?? null) : auftrag.liefertermin;
      const effManuell = manuellFlagExplizit ? (felder.promisedDateManuell as boolean) : auftrag.promisedDateManuell;
      if (!effManuell && !promisedDateExplizit) {
        if (lieferterminGeaendert || (auftrag.promisedDate === null && effLiefertermin)) {
          data.promisedDate = parseLiefertermin(effLiefertermin);
        } else if (manuellFlagExplizit) {
          // Sperr-Flag explizit zurückgesetzt → sofort neu ableiten
          data.promisedDate = parseLiefertermin(effLiefertermin);
        }
      }

      let materialInfo: NettobedarfResult | null = null;

      if (neuerStatus !== undefined) {
        const istLager = auftrag.nummer.startsWith("L");

        // Endprüf-Gate (ISO 8.6, KF3-26): Nicht-Lager-Aufträge brauchen vor dem
        // Abschluss ein Prüfprotokoll mit Freigabe — VOR allen Buchungs-Hooks.
        // Es zählt die JÜNGSTE Endprüfung (eine spätere "abweichend"-Prüfung
        // widerruft eine ältere Freigabe), und sie muss nach der letzten
        // Reaktivierung liegen (Nacharbeit erfordert neue Prüfung).
        if (neuerStatus === "abgeschlossen" && auftrag.status !== "abgeschlossen" && !istLager) {
          const juengste = await tx.pruefung.findFirst({
            where: { auftragId: id, typ: "endpruefung" },
            orderBy: { geprueftAm: "desc" },
          });
          let freigabe = juengste != null && ["ok", "bedingtFrei"].includes(juengste.ergebnis);
          if (freigabe) {
            const letzteReaktivierung = await tx.auditEvent.findFirst({
              where: { entitaet: "auftrag", entitaetId: id, aktion: "statuswechsel", altWert: "abgeschlossen" },
              orderBy: { zeitstempel: "desc" },
            });
            if (letzteReaktivierung && (juengste as { geprueftAm: Date }).geprueftAm < letzteReaktivierung.zeitstempel) {
              freigabe = false;
            }
          }
          if (!freigabe) throw new PruefungFehltError();
        }

        // Kommissionierungs-Hook: Bedarf prüfen, Soll-Zeit einfrieren, Entnahmen buchen
        if (neuerStatus === "kommissioniert" && auftrag.status === "offen") {
          // Gate = dispositive Sicht (schützt ältere Reservierungen, KF3-33);
          // Buchung/Snapshot/Soll-Zeit = PHYSISCHE Sicht — der Entnahme-Quirk
          // (ausLager ODER nettobedarf) würde sonst über-/unterbuchen.
          const bedarf = await nettobedarfFuerAuftrag(tx, id);
          materialInfo = bedarf;
          const bedarfBuchung = await nettobedarfFuerAuftrag(tx, id, "physisch");
          // Soll-Zeit VOR der Entnahme-Buchung einfrieren (Bestand = Vor-Kommissionier-Stand)
          const soll = await sollSekundenNetto(tx, id, undefined, "physisch");
          data.planZeitSekunden = soll != null ? Math.round(soll) : null;
          if (bedarf.mangel && !force) throw new MangelError(bedarf.mangelnd);
          const lagerortId = lagerortParam ?? (await ersterAktiverLagerortId(tx));
          if (lagerortId) await entnahmenBuchen(tx, id, auth.benutzer.id, lagerortId, bedarfBuchung);
          // Materialstand einfrieren (ISO 7.5, KF3-28)
          await materialSnapshotSchreiben(tx, id, bedarfBuchung);
          // Reservierung in derselben Transaktion durch die Entnahme ersetzen (KF3-33)
          await reservierungAufloesen(tx, id, "kommissionierung", auth.benutzer.id);
        }

        // Fertigmeldungs-Hook (L-Aufträge): Zugang bei Abschluss, Storno bei Reaktivierung
        if (istLager && neuerStatus === "abgeschlossen" && auftrag.status !== "abgeschlossen") {
          const lagerortId = lagerortParam ?? (await ersterAktiverLagerortId(tx));
          if (lagerortId) await fertigmeldungBuchen(tx, id, auth.benutzer.id, lagerortId);
        } else if (istLager && auftrag.status === "abgeschlossen" && neuerStatus !== "abgeschlossen") {
          await fertigmeldungStornieren(tx, id);
        }

        // Nicht-Lager-Aufträge: Entnahmen nachbuchen wenn Kommissionierung übersprungen wurde
        if (!istLager && neuerStatus === "abgeschlossen" && auftrag.status !== "abgeschlossen") {
          const hatEntnahme = await tx.materialbewegung.findFirst({
            where: { auftragId: id, art: "entnahme" },
          });
          if (!hatEntnahme) {
            const lagerortId = lagerortParam ?? (await ersterAktiverLagerortId(tx));
            if (lagerortId) {
              // Ungegatete Nachbuchung → physische Sicht (siehe Kommissionier-Hook)
              const nachBedarf = await nettobedarfFuerAuftrag(tx, id, "physisch");
              await entnahmenBuchen(tx, id, auth.benutzer.id, lagerortId, nachBedarf);
              // Auch bei übersprungener Kommissionierung den Materialstand einfrieren (KF3-28)
              await materialSnapshotSchreiben(tx, id, nachBedarf);
            }
          }
        }

        // Abschluss beendet den Material-Anspruch — gilt für Lager- UND
        // Fertigungsaufträge, auch wenn Entnahmen schon existierten (KF3-33)
        if (neuerStatus === "abgeschlossen" && auftrag.status !== "abgeschlossen") {
          await reservierungAufloesen(tx, id, "abschluss", auth.benutzer.id);
        }

        // Pause: offene Zeitbuchungen schließen (V2: schliesse_offene_buchungen)
        if (neuerStatus === "pausiert" && auftrag.status !== "pausiert") {
          await tx.auftragszeit.updateMany({
            where: { auftragId: id, ende: null },
            data: { ende: new Date(), beendetDurch: "pause" },
          });
        }

        data.status = neuerStatus;
        if (neuerStatus === "laeuft" && auftrag.start === null) data.start = new Date();
        if (neuerStatus === "abgeschlossen") {
          if (auftrag.ende === null) data.ende = new Date();
        } else {
          data.ende = null;
        }
      }

      // Audit (KF3-25): Statuswechsel + geänderte Felder mit Benutzer-/Zeitstempel
      if (neuerStatus !== undefined && neuerStatus !== auftrag.status) {
        await auditEintrag(tx, {
          entitaet: "auftrag",
          entitaetId: id,
          aktion: "statuswechsel",
          feld: "status",
          altWert: auftrag.status,
          neuWert: neuerStatus,
          kontext: { nummer: auftrag.nummer, ...(force ? { force: true } : {}) },
          benutzerId: auth.benutzer.id,
        });
      }
      const neuFuerAudit: Record<string, unknown> = { ...felder };
      if ("promisedDate" in felder) {
        // String → Date, damit der Diff nicht an Formatunterschieden hängt
        neuFuerAudit.promisedDate = felder.promisedDate ? new Date(felder.promisedDate) : null;
      } else if (data.promisedDate !== undefined) {
        // Auch die AUTO-Ableitung aus dem Liefertermin protokollieren —
        // promisedDate speist Statusampel und Liefertreue-KPI (Review-Befund)
        neuFuerAudit.promisedDate = data.promisedDate;
      }
      await auditFeldDiff(tx, "auftrag", id, auth.benutzer.id, auftrag, neuFuerAudit, AUDIT_FELDER);

      const updated = await tx.auftrag.update({ where: { id }, data });
      return { updated, materialInfo };
    });

    return ok(
      result.materialInfo ? { ...result.updated, material: result.materialInfo } : result.updated
    );
  } catch (e) {
    if (e instanceof KundenauftragUngueltig) {
      return err(`Kundenauftrag: ${e.message}`, 400);
    }
    if (e instanceof MangelError) {
      return NextResponse.json(
        {
          error: "Materialmangel",
          mangelnd: e.mangelnd,
          hinweis: "force=true übergeben, um trotzdem zu kommissionieren",
        },
        { status: 409 }
      );
    }
    if (e instanceof PruefungFehltError) {
      return NextResponse.json(
        {
          error: "pruefungFehlt",
          hinweis: "Vor dem Abschluss ist eine Endprüfung mit Freigabe erforderlich (ISO 8.6).",
        },
        { status: 409 }
      );
    }
    if (e instanceof MangelNotFound) return err("Auftrag nicht gefunden", 404);
    return handlePrismaError(e);
  }
}

class MangelNotFound extends Error {}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    await prisma.$transaction(async (tx) => {
      const auftrag = await tx.auftrag.findUnique({ where: { id } });
      if (!auftrag) throw new MangelNotFound();
      // Audit VOR dem Cascade-Delete: das FK-lose Event ist danach der
      // einzige verbleibende Nachweis (ISO 7.5).
      await auditEintrag(tx, {
        entitaet: "auftrag",
        entitaetId: id,
        aktion: "geloescht",
        kontext: { nummer: auftrag.nummer, bezeichnung: auftrag.bezeichnung, status: auftrag.status },
        benutzerId: auth.benutzer.id,
      });
      await tx.auftrag.delete({ where: { id } });
    });
    return ok({ ok: true });
  } catch (e) {
    if (e instanceof MangelNotFound) return err("Auftrag nicht gefunden", 404);
    return handlePrismaError(e);
  }
}
