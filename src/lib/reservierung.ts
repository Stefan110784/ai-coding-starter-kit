/**
 * Materialreservierung (Anforderung Kap. 2; KF3-33).
 *
 * Eine Reservierung ist ein dispositiver Anspruch eines Auftrags auf Material —
 * KEINE Materialbewegung (Bestand bleibt die Summe der Bewegungen, bestand.ts)
 * und KEIN ISO-Nachweis (das sind AuditEvent + Material-Snapshot). Lebenszyklus
 * = Existenz der Zeile: entsteht mit den Auftragspositionen und wird in
 * DERSELBEN Transaktion gelöscht, in der die ersetzende Entnahme gebucht wird —
 * „verfügbar“ zählt dadurch über die Transaktionsgrenze hinweg nie doppelt.
 *
 * Zwei Sichten auf „verfügbar“ (einzige Wahrheitsquelle hier):
 * - Netting-/Lagersicht: bestand − fremde Reservierungen, geklemmt auf ≥ 0
 *   (`effektiverBestand`) — sonst entstünden negative ausLager-Mengen.
 * - Beschaffungssicht (Bestellvorschläge): bestand − reserviert + offen
 *   bestellt, UNGEKAPPT — reservierte Fehlmengen müssen Vorschläge auslösen.
 */
import type { Db } from "@/lib/bestand";
import { MENGEN_EPS } from "@/lib/bestellung";
import type { NettobedarfResult } from "@/lib/stueckliste";
import { auditEintrag } from "@/lib/audit";

/** Offen reservierte Menge je Artikel; eigener Anspruch optional ausgenommen. */
export async function reserviertJeArtikel(
  db: Db,
  ausserAuftragId?: string
): Promise<Map<string, number>> {
  const rows = await db.materialReservierung.groupBy({
    by: ["artikelnummer"],
    where: ausserAuftragId ? { auftragId: { not: ausserAuftragId } } : undefined,
    _sum: { menge: true },
  });
  return new Map(rows.map((r) => [r.artikelnummer, r._sum.menge ?? 0]));
}

/**
 * Prioritätsregel fürs Netting: Den effektiven Bestand eines Auftrags mindern
 * nur Reservierungen ÄLTERER Aufträge (Anlagezeitpunkt) — wer zuerst
 * reserviert hat, behält seinen Anspruch. Ohne diese Regel würde ein später
 * angelegter, nur teilgedeckter Auftrag mit seinem vollen Anspruch die
 * Kommissionierung des früheren blockieren. Anker ist auftrag.erstelltAm
 * (stabil über Beleg-Refreshes, anders als die Reservierungszeile selbst).
 */
export async function fremdeAeltereReservierungen(
  db: Db,
  auftragId: string
): Promise<Map<string, number>> {
  const auftrag = await db.auftrag.findUnique({
    where: { id: auftragId },
    select: { erstelltAm: true },
  });
  if (!auftrag) return new Map();
  const rows = await db.materialReservierung.findMany({
    where: {
      auftragId: { not: auftragId },
      // Tiebreaker bei identischem erstelltAm: deterministisch über die ID,
      // sonst würden sich zeitgleiche Aufträge gegenseitig dauerhaft ignorieren
      OR: [
        { auftrag: { erstelltAm: { lt: auftrag.erstelltAm } } },
        { auftrag: { erstelltAm: auftrag.erstelltAm }, auftragId: { lt: auftragId } },
      ],
    },
    select: { artikelnummer: true, menge: true },
  });
  const summe = new Map<string, number>();
  for (const r of rows) {
    summe.set(r.artikelnummer, (summe.get(r.artikelnummer) ?? 0) + r.menge);
  }
  return summe;
}

/**
 * Netting-Sicht: Bestand abzüglich (fremder) Reservierungen, je Artikel auf
 * ≥ 0 geklemmt. Reine Funktion — liefert eine NEUE Map.
 */
export function effektiverBestand(
  bestand: Map<string, number>,
  reserviert: Map<string, number>
): Map<string, number> {
  const eff = new Map(bestand);
  for (const [artikelnummer, menge] of reserviert) {
    if (menge <= MENGEN_EPS) continue;
    eff.set(artikelnummer, Math.max(0, (eff.get(artikelnummer) ?? 0) - menge));
  }
  return eff;
}

/**
 * Reservierungen eines Auftrags aus dem Bedarf neu aufbauen (delete + create,
 * idempotent). Reserviert wird der VOLLE Anspruch (ausLager + nettobedarf) —
 * schützt auch erst eintreffende Ware. Innerhalb der Anlage-/Import-Transaktion
 * aufrufen.
 */
export async function reservierungAktualisieren(
  tx: Db,
  auftragId: string,
  bedarf: NettobedarfResult,
  benutzerId?: string | null
): Promise<number> {
  const geloescht = await tx.materialReservierung.deleteMany({ where: { auftragId } });
  const zeilen = bedarf.positionen
    .map((p) => ({
      auftragId,
      artikelnummer: p.artikelnummer,
      menge: p.ausLager + p.nettobedarf,
      typ: p.typ,
    }))
    .filter((z) => z.menge > MENGEN_EPS);
  if (zeilen.length > 0) {
    await tx.materialReservierung.createMany({ data: zeilen });
  }
  if (zeilen.length > 0 || geloescht.count > 0) {
    await auditEintrag(tx, {
      entitaet: "auftrag",
      entitaetId: auftragId,
      aktion: "reserviert",
      kontext: {
        positionen: zeilen.length,
        mangel: bedarf.mangel,
        ...(bedarf.mangel ? { fehlteile: bedarf.mangelnd.map((m) => m.artikelnummer) } : {}),
      },
      benutzerId: benutzerId ?? null,
    });
  }
  return zeilen.length;
}

/**
 * Reservierungen eines Auftrags auflösen — in derselben Transaktion wie die
 * ersetzende Buchung (Kommissionierung, Direktabschluss, manuelle Entnahme).
 * Idempotent; auditiert nur, wenn tatsächlich etwas aufgelöst wurde.
 */
export async function reservierungAufloesen(
  tx: Db,
  auftragId: string,
  grund: "kommissionierung" | "abschluss" | "entnahme",
  benutzerId?: string | null
): Promise<number> {
  const res = await tx.materialReservierung.deleteMany({ where: { auftragId } });
  if (res.count > 0) {
    await auditEintrag(tx, {
      entitaet: "auftrag",
      entitaetId: auftragId,
      aktion: "reservierungAufgeloest",
      kontext: { grund, zeilen: res.count },
      benutzerId: benutzerId ?? null,
    });
  }
  return res.count;
}
