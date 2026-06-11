/**
 * Einmaliges Backfill (KF3-37): Kundenstamm aus den vorhandenen
 * Auftrag.kunde-Strings aufbauen (quelle "migration", Review-Ausgabe).
 * Bewusst KEINE Kundenaufträge und kein Auto-Verknüpfen — nur Stammdaten,
 * damit die Auswahllisten gefüllt sind.
 * Ausführen: set -a && source .env && set +a && npx tsx scripts/backfill-kunden.ts
 * (idempotent über Namensvergleich, normalisiert Mehrfach-Leerzeichen)
 */
import { prisma } from "../src/lib/prisma";

function normalisiert(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

async function main() {
  const auftraege = await prisma.auftrag.findMany({
    where: { kunde: { not: null } },
    select: { kunde: true },
  });

  const namen = new Map<string, string>(); // lowercase → Anzeige-Schreibweise (erste gewinnt)
  for (const a of auftraege) {
    const n = normalisiert(a.kunde as string);
    if (!n) continue;
    const schluessel = n.toLowerCase();
    if (!namen.has(schluessel)) namen.set(schluessel, n);
  }

  const vorhandene = await prisma.kunde.findMany({ select: { name: true } });
  const schonDa = new Set(vorhandene.map((k) => normalisiert(k.name).toLowerCase()));

  let angelegt = 0;
  for (const [schluessel, name] of [...namen.entries()].sort()) {
    if (schonDa.has(schluessel)) {
      console.log(`übersprungen (existiert): ${name}`);
      continue;
    }
    const kunde = await prisma.kunde.create({ data: { name, quelle: "migration" } });
    console.log(`angelegt: K-${kunde.nr} ${name}`);
    angelegt++;
  }
  console.log(`Fertig: ${angelegt} Kunden angelegt (${namen.size} eindeutige Namen in den Aufträgen).`);
  console.log("Bitte Liste auf Schreibvarianten prüfen — Dubletten deaktivieren statt löschen.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
