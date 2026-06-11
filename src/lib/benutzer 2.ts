/** Benutzer↔Mitarbeiter-Auflösung (Port von V2 services/benutzer.py). */
import { prisma } from "@/lib/prisma";
import type { Benutzer, Mitarbeiter } from "@/generated/prisma";

/** Kurzes Kürzel aus dem Namen: "Max Mustermann" → "MM". */
function kuerzelAusName(name: string): string {
  const teile = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return "??";
  if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
  return (teile[0][0] + teile[teile.length - 1][0]).toUpperCase();
}

/**
 * Liefert den Mitarbeiter-Eintrag des eingeloggten Benutzers — und legt ihn
 * bei Bedarf an, damit jeder Nutzer ohne Admin-Vorarbeit auf sich selbst
 * buchen kann. Reihenfolge: bereits verknüpft → gleichnamigen unverknüpften
 * übernehmen → neu anlegen.
 */
export async function mitarbeiterFuerBenutzer(benutzer: Benutzer): Promise<Mitarbeiter> {
  const verknuepft = await prisma.mitarbeiter.findFirst({ where: { benutzerId: benutzer.id } });
  if (verknuepft) return verknuepft;

  const name = (benutzer.name || benutzer.username || "").trim();
  if (name) {
    const kandidat = await prisma.mitarbeiter.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, benutzerId: null },
    });
    if (kandidat) {
      return prisma.mitarbeiter.update({
        where: { id: kandidat.id },
        data: { benutzerId: benutzer.id },
      });
    }
  }

  // Kürzel ist unique → bei Kollision Ziffer anhängen
  const basis = kuerzelAusName(name || benutzer.username);
  let kuerzel = basis;
  for (let i = 2; await prisma.mitarbeiter.findUnique({ where: { kuerzel } }); i++) {
    kuerzel = `${basis}${i}`;
  }

  return prisma.mitarbeiter.create({
    data: {
      name: name || benutzer.username,
      kuerzel,
      status: "aktiv",
      benutzerId: benutzer.id,
    },
  });
}
