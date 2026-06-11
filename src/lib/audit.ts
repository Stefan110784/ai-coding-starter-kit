/**
 * Audit-Historie (ISO 9001 Kap. 7.5: Benutzer- und Zeitstempel auf jeder
 * Buchung, lückenlose Historie statt überschreibbarer Felder).
 *
 * Ein generisches Ereignis-Log statt Historientabellen je Entität: eine
 * Tabelle, ein Helper, ohne FK auf die Zielentität — der Nachweis überlebt
 * damit auch das Löschen des Datensatzes (z. B. Auftrag-Cascade).
 */
import type { Db } from "@/lib/bestand";
import type { Prisma } from "@/generated/prisma";

export interface AuditEintrag {
  entitaet: string;
  entitaetId: string;
  aktion: string; // "statuswechsel" | "feldAenderung" | "erstellt" | "geloescht" | "endpruefung" | …
  feld?: string | null;
  altWert?: string | null;
  neuWert?: string | null;
  kontext?: Prisma.InputJsonValue;
  benutzerId?: string | null;
}

/** Einzelnes Ereignis schreiben (innerhalb oder außerhalb einer Transaktion). */
export async function auditEintrag(db: Db, e: AuditEintrag): Promise<void> {
  await db.auditEvent.create({ data: e });
}

/** Wert für die Historie normalisieren: leer → null, Datum → ISO, sonst String. */
export function auditWert(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Reine Diff-Funktion: vergleicht Alt-Zustand und (partielles) Update und
 * liefert je tatsächlich geändertem Feld ein "feldAenderung"-Ereignis.
 * Felder, die im Update fehlen (undefined), gelten als unverändert.
 */
export function feldDiffs(
  entitaet: string,
  entitaetId: string,
  benutzerId: string | null | undefined,
  alt: Record<string, unknown>,
  neu: Record<string, unknown>,
  felder: string[]
): AuditEintrag[] {
  const events: AuditEintrag[] = [];
  for (const feld of felder) {
    if (!(feld in neu) || neu[feld] === undefined) continue;
    const altWert = auditWert(alt[feld]);
    const neuWert = auditWert(neu[feld]);
    if (altWert === neuWert) continue;
    events.push({
      entitaet,
      entitaetId,
      aktion: "feldAenderung",
      feld,
      altWert,
      neuWert,
      benutzerId: benutzerId ?? null,
    });
  }
  return events;
}

/** Diffs berechnen und in einem Rutsch schreiben. */
export async function auditFeldDiff(
  db: Db,
  entitaet: string,
  entitaetId: string,
  benutzerId: string | null | undefined,
  alt: Record<string, unknown>,
  neu: Record<string, unknown>,
  felder: string[]
): Promise<void> {
  const events = feldDiffs(entitaet, entitaetId, benutzerId, alt, neu, felder);
  if (events.length === 0) return;
  await db.auditEvent.createMany({ data: events });
}
