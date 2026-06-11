/**
 * Einmaliges Backfill (KF3-33): Reservierungen für bestehende OFFENE Aufträge
 * ohne Entnahmen anlegen — neue Aufträge reservieren ab sofort selbst.
 * Ausführen: npx tsx scripts/backfill-reservierungen.ts
 * (idempotent — reservierungAktualisieren ersetzt vorhandene Zeilen)
 */
import { prisma } from "../src/lib/prisma";
import { nettobedarfFuerAuftrag } from "../src/lib/stueckliste";
import { reservierungAktualisieren } from "../src/lib/reservierung";

async function main() {
  const offene = await prisma.auftrag.findMany({
    where: { status: "offen", positionen: { some: { artikelnummer: { not: null } } } },
    select: { id: true, nummer: true, _count: { select: { materialbewegungen: { where: { art: "entnahme" } } } } },
  });

  let angelegt = 0;
  for (const a of offene) {
    if (a._count.materialbewegungen > 0) {
      console.log(`übersprungen (hat Entnahmen): ${a.nummer}`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const bedarf = await nettobedarfFuerAuftrag(tx, a.id);
      const zeilen = await reservierungAktualisieren(tx, a.id, bedarf, null);
      console.log(`reserviert: ${a.nummer} (${zeilen} Artikel${bedarf.mangel ? ", FEHLTEILE" : ""})`);
      angelegt++;
    });
  }
  console.log(`Fertig: ${angelegt}/${offene.length} Aufträge reserviert.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
