/**
 * Bestellvorschläge (Anforderung Kap. 3; KF3-29): Meldebestand-Unterschreitung
 * + EOQ als Vorschlagsmenge + Wiederbeschaffungszeit des Lieferanten.
 *
 * verfügbar = Lagerbestand + offen bestellte Menge. Vorschlag, wenn ein
 * Mindestbestand gepflegt ist und verfügbar darunter liegt.
 */
import { calculateEOQ } from "@/lib/eoq";
import { bestandJeArtikel, type Db } from "@/lib/bestand";
import { offeneBestellmengeJeArtikel } from "@/lib/bestellung";

export interface VorschlagLieferant {
  lieferantId: string;
  name: string;
  einkaufspreis: number;
  mindestmenge: number;
  lieferzeitTage: number;
  eoq: number | null;
}

export interface Bestellvorschlag {
  artikelnummer: string;
  bezeichnung: string;
  einheit: string;
  bestand: number;
  offenBestellt: number;
  verfuegbar: number;
  mindestbestand: number;
  vorschlagsmenge: number;
  lieferant: VorschlagLieferant | null;
  weitereLieferanten: VorschlagLieferant[];
}

/** Reine Mengenlogik: max(EOQ, Mindestmenge, Lücke zum Mindestbestand). */
export function vorschlagsmenge(
  mindestbestand: number,
  verfuegbar: number,
  eoq: number | null,
  mindestmenge: number
): number {
  const luecke = Math.max(0, mindestbestand - verfuegbar);
  return Math.ceil(Math.max(eoq ?? 0, mindestmenge, luecke));
}

/**
 * EOQ aus den Parametern eines Artikel-Lieferant-Links. Konvention der
 * Stammdaten (Lieferanten-Seite/Schema): `lagerkostensatz` ist der ABSOLUTE
 * €-Betrag je Stück und Jahr (H), kein Prozentsatz.
 */
export function eoqAusLink(link: {
  jahresbedarf: number | null;
  bestellkosten: unknown;
  lagerkostensatz: unknown;
}): number | null {
  const D = link.jahresbedarf ?? 0;
  const S = Number(link.bestellkosten ?? 0);
  const H = Number(link.lagerkostensatz ?? 0);
  return calculateEOQ(D, S, H);
}

/**
 * Vorschlagsliste über alle bestandsgeführten Artikel mit Mindestbestand:
 * Lieferantenwahl = vollständige EOQ-Parameter vor günstigstem Preis.
 */
export async function generiereBestellvorschlaege(db: Db): Promise<Bestellvorschlag[]> {
  const [artikel, bestand, offen] = await Promise.all([
    db.artikel.findMany({
      where: { mindestbestand: { not: null }, bestandAktiv: true, gesperrt: false },
      select: {
        artikelnummer: true,
        bezeichnung: true,
        einheit: true,
        mindestbestand: true,
        lieferanten: {
          include: { lieferant: { select: { id: true, name: true, lieferzeitTage: true, aktiv: true } } },
        },
      },
    }),
    bestandJeArtikel(db),
    offeneBestellmengeJeArtikel(db),
  ]);

  const vorschlaege: Bestellvorschlag[] = [];
  for (const a of artikel) {
    const mindest = a.mindestbestand as number;
    const lager = bestand.get(a.artikelnummer) ?? 0;
    const bestellt = offen.get(a.artikelnummer) ?? 0;
    const verfuegbar = lager + bestellt;
    if (verfuegbar >= mindest) continue;

    const kandidaten: VorschlagLieferant[] = a.lieferanten
      .filter((l) => l.lieferant.aktiv)
      .map((l) => ({
        lieferantId: l.lieferant.id,
        name: l.lieferant.name,
        einkaufspreis: Number(l.einkaufspreis),
        mindestmenge: l.mindestmenge,
        lieferzeitTage: l.lieferant.lieferzeitTage,
        eoq: eoqAusLink(l),
      }))
      // EOQ-fähige Links zuerst, innerhalb dessen günstigster Preis
      .sort((x, y) =>
        (y.eoq != null ? 1 : 0) - (x.eoq != null ? 1 : 0) || x.einkaufspreis - y.einkaufspreis
      );

    const wahl = kandidaten[0] ?? null;
    vorschlaege.push({
      artikelnummer: a.artikelnummer,
      bezeichnung: a.bezeichnung,
      einheit: a.einheit,
      bestand: lager,
      offenBestellt: bestellt,
      verfuegbar,
      mindestbestand: mindest,
      vorschlagsmenge: vorschlagsmenge(mindest, verfuegbar, wahl?.eoq ?? null, wahl?.mindestmenge ?? 0),
      lieferant: wahl,
      weitereLieferanten: kandidaten.slice(1),
    });
  }

  return vorschlaege.sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer));
}
