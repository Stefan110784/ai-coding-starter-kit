/** Arbeitsvorrat-Helfer (V2: api/arbeitsvorrat.py). */
import { prisma } from "@/lib/prisma";
import type { Auftrag, Auftragsstatus } from "@/generated/prisma";

export const AKTIVE_STATUS: Auftragsstatus[] = ["offen", "kommissioniert", "laeuft", "pausiert"];

export function arbeitsvorratDict(a: Auftrag, eingebucht: boolean) {
  return {
    id: a.id,
    nummer: a.nummer,
    bezeichnung: a.bezeichnung,
    menge: a.menge,
    status: a.status,
    liefertermin: a.liefertermin,
    promisedDate: a.promisedDate,
    eingebucht,
  };
}

/** Auftrag-IDs, auf die der Mitarbeiter gerade eingestempelt ist. */
export async function offeneBuchungen(mitarbeiterId: string): Promise<Set<string>> {
  const rows = await prisma.auftragszeit.findMany({
    where: { mitarbeiterId, ende: null },
    select: { auftragId: true },
  });
  return new Set(rows.map((r) => r.auftragId));
}

/** Zugewiesenes Team eines Auftrags (kurz, alphabetisch). */
export async function zugewieseneMitarbeiter(auftragId: string) {
  const team = await prisma.auftragMitarbeiter.findMany({
    where: { auftragId },
    include: { mitarbeiter: { select: { id: true, name: true, kuerzel: true } } },
    orderBy: { mitarbeiter: { name: "asc" } },
  });
  return team.map((t) => t.mitarbeiter);
}
