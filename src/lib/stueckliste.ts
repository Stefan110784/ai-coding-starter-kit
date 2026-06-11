/**
 * Stücklistenauflösung (mehrstufig) mit Bestandsnetting — Port von V2
 * services/stueckliste.py.
 *
 * Algorithmus:
 *   1. Stückliste rekursiv auflösen → Bruttobedarf je Artikel.
 *   2. Netting top-down: Lagerbestand einer Baugruppe deckt den Bedarf zuerst
 *      (aus_lager), nur der Restbedarf wird auf die Kindartikel aufgeteilt.
 *   3. Blätter (Einzelteile) tragen den Nettobedarf.
 *
 * Bewusst erhaltene V2-Eigenheiten:
 *   - Der Bestands-Cache wird beim Netting NICHT dekrementiert — zwei
 *     Auftragspositionen mit demselben Artikel sehen beide den vollen Bestand.
 *   - Baugruppen mit ausLager == 0 erscheinen nicht in `positionen`
 *     (nur im Strukturbaum).
 *   - Entnahmemenge = ausLager > 0 ? ausLager : nettobedarf.
 */
import { ABPACKZEIT_MINUTEN } from "@/lib/config";
import { bestandJeArtikel, type Db } from "@/lib/bestand";
import { effektiverBestand, fremdeAeltereReservierungen } from "@/lib/reservierung";

export interface KindPos {
  artikelnummer: string;
  menge: number;
  einheit: string;
  bezeichnung: string;
}

/** Vorberechnete Daten für die reinen Rechenfunktionen (3 Queries gesamt). */
export interface BomDaten {
  kinder: Map<string, KindPos[]>;
  bestand: Map<string, number>;
  vorgabezeit: Map<string, number>;
}

export interface AuftragPos {
  artikelnummer: string;
  menge: number;
  einheit: string | null;
  bezeichnung: string | null;
}

export interface BedarfPosition {
  artikelnummer: string;
  bezeichnung: string | null;
  einheit: string | null;
  bruttobedarf: number;
  bestand: number;
  nettobedarf: number;
  ausLager: number;
  typ: "einzelteil" | "baugruppe";
}

export interface NettobedarfResult {
  positionen: BedarfPosition[];
  mangel: boolean;
  mangelnd: BedarfPosition[];
}

export interface BaumZeile extends Omit<BedarfPosition, "ausLager"> {
  ebene: number;
}

// ---------------------------------------------------------------------------
// Daten laden
// ---------------------------------------------------------------------------

export async function ladeBomDaten(db: Db): Promise<BomDaten> {
  const [positionen, bestand, artikelMitZeit] = await Promise.all([
    db.stuecklistePosition.findMany({
      include: { kind: { select: { artikelnummer: true, bezeichnung: true, einheit: true } } },
      orderBy: [{ posNr: "asc" }, { kindArtikel: "asc" }],
    }),
    bestandJeArtikel(db),
    db.artikel.findMany({
      where: { vorgabezeit: { not: null } },
      select: { artikelnummer: true, vorgabezeit: true },
    }),
  ]);

  const kinder = new Map<string, KindPos[]>();
  for (const p of positionen) {
    const liste = kinder.get(p.parentArtikel) ?? [];
    liste.push({
      artikelnummer: p.kindArtikel,
      menge: p.menge,
      einheit: p.einheit || p.kind.einheit,
      bezeichnung: p.kind.bezeichnung,
    });
    kinder.set(p.parentArtikel, liste);
  }

  return {
    kinder,
    bestand,
    vorgabezeit: new Map(artikelMitZeit.map((a) => [a.artikelnummer, a.vorgabezeit as number])),
  };
}

async function ladeAuftragPositionen(db: Db, auftragId: string): Promise<AuftragPos[]> {
  const rows = await db.auftragPosition.findMany({
    where: { auftragId, artikelnummer: { not: null } },
    include: { artikel: { select: { bezeichnung: true, einheit: true } } },
  });
  return rows.map((r) => ({
    artikelnummer: r.artikelnummer as string,
    menge: r.menge,
    einheit: r.einheit || r.artikel?.einheit || null,
    bezeichnung: r.artikel?.bezeichnung ?? r.bezeichnung,
  }));
}

// ---------------------------------------------------------------------------
// Netting (reine Funktionen)
// ---------------------------------------------------------------------------

function nettingRekursiv(
  daten: BomDaten,
  artikelnummer: string,
  bedarf: number,
  einheit: string | null,
  bezeichnung: string | null,
  sammler: BedarfPosition[],
  pfad: Set<string>
): void {
  const kinder = daten.kinder.get(artikelnummer) ?? [];
  const verfuegbar = daten.bestand.get(artikelnummer) ?? 0;

  if (kinder.length === 0) {
    sammler.push({
      artikelnummer,
      bezeichnung,
      einheit,
      bruttobedarf: bedarf,
      bestand: verfuegbar,
      nettobedarf: Math.max(0, bedarf - verfuegbar),
      ausLager: Math.min(bedarf, verfuegbar),
      typ: "einzelteil",
    });
    return;
  }

  const ausLager = Math.min(bedarf, verfuegbar);
  const restbedarf = bedarf - ausLager;

  if (ausLager > 0) {
    sammler.push({
      artikelnummer,
      bezeichnung,
      einheit,
      bruttobedarf: bedarf,
      bestand: verfuegbar,
      nettobedarf: 0,
      ausLager,
      typ: "baugruppe",
    });
  }

  if (restbedarf > 0) {
    for (const kind of kinder) {
      if (pfad.has(kind.artikelnummer)) continue; // Zyklenschutz
      nettingRekursiv(
        daten,
        kind.artikelnummer,
        restbedarf * kind.menge,
        kind.einheit,
        kind.bezeichnung,
        sammler,
        new Set(pfad).add(artikelnummer)
      );
    }
  }
}

export function nettobedarfAusDaten(daten: BomDaten, positionen: AuftragPos[]): NettobedarfResult {
  const alle: BedarfPosition[] = [];
  for (const pos of positionen) {
    nettingRekursiv(daten, pos.artikelnummer, pos.menge, pos.einheit, pos.bezeichnung, alle, new Set());
  }

  // Gleiche Artikel zusammenführen
  const merged = new Map<string, BedarfPosition>();
  for (const e of alle) {
    const vorhanden = merged.get(e.artikelnummer);
    if (vorhanden) {
      vorhanden.bruttobedarf += e.bruttobedarf;
      vorhanden.nettobedarf += e.nettobedarf;
      vorhanden.ausLager += e.ausLager;
    } else {
      merged.set(e.artikelnummer, { ...e });
    }
  }

  const liste = [...merged.values()].sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer));
  const mangelnd = liste.filter((e) => e.nettobedarf > 0 && e.bestand < e.bruttobedarf);
  return { positionen: liste, mangel: mangelnd.length > 0, mangelnd };
}

/**
 * Zwei Bestandssichten (KF3-33):
 * - "effektiv" (dispositiv): physisch − fremde ältere Reservierungen — für
 *   Verfügbarkeitsprüfung, Mangel-Gate und Planungsansichten.
 * - "physisch": unverändert — für BUCHUNGEN (Entnahmen, Snapshot, Soll-Zeit
 *   beim Kommissionieren). Der V2-Entnahme-Quirk (ausLager ODER nettobedarf)
 *   ist für physischen Bestand entworfen; mit effektiver Sicht entstünden
 *   Über-/Unterbuchungen (Review-Befund Paket 3).
 */
export type BestandsSicht = "effektiv" | "physisch";

export async function nettobedarfFuerAuftrag(
  db: Db,
  auftragId: string,
  sicht: BestandsSicht = "effektiv"
): Promise<NettobedarfResult> {
  const [daten, positionen, reserviert] = await Promise.all([
    ladeBomDaten(db),
    ladeAuftragPositionen(db, auftragId),
    sicht === "effektiv" ? fremdeAeltereReservierungen(db, auftragId) : Promise.resolve(new Map<string, number>()),
  ]);
  if (sicht === "effektiv") {
    daten.bestand = effektiverBestand(daten.bestand, reserviert);
  }
  return nettobedarfAusDaten(daten, positionen);
}

// ---------------------------------------------------------------------------
// Strukturbaum (eingerückte Sicht, gespiegelt zum Netting)
// ---------------------------------------------------------------------------

function baumRekursiv(
  daten: BomDaten,
  artikelnummer: string,
  bedarf: number,
  einheit: string | null,
  bezeichnung: string | null,
  sammler: BaumZeile[],
  ebene: number,
  pfad: Set<string>
): void {
  const kinder = daten.kinder.get(artikelnummer) ?? [];
  const verfuegbar = daten.bestand.get(artikelnummer) ?? 0;
  const ausLager = Math.min(bedarf, verfuegbar);
  const restbedarf = bedarf - ausLager;

  if (kinder.length === 0) {
    sammler.push({
      artikelnummer,
      bezeichnung,
      einheit,
      bruttobedarf: bedarf,
      bestand: verfuegbar,
      nettobedarf: Math.max(0, bedarf - verfuegbar),
      typ: "einzelteil",
      ebene,
    });
    return;
  }

  sammler.push({
    artikelnummer,
    bezeichnung,
    einheit,
    bruttobedarf: bedarf,
    bestand: verfuegbar,
    nettobedarf: restbedarf, // bei Baugruppen = was tatsächlich gefertigt wird
    typ: "baugruppe",
    ebene,
  });

  if (restbedarf > 0) {
    for (const kind of kinder) {
      if (pfad.has(kind.artikelnummer)) continue;
      baumRekursiv(
        daten,
        kind.artikelnummer,
        restbedarf * kind.menge,
        kind.einheit,
        kind.bezeichnung,
        sammler,
        ebene + 1,
        new Set(pfad).add(artikelnummer)
      );
    }
  }
}

export function bedarfsbaumAusDaten(daten: BomDaten, positionen: AuftragPos[]): BaumZeile[] {
  const baum: BaumZeile[] = [];
  for (const pos of positionen) {
    baumRekursiv(daten, pos.artikelnummer, pos.menge, pos.einheit, pos.bezeichnung, baum, 0, new Set());
  }
  return baum;
}

export async function bedarfsbaumFuerAuftrag(db: Db, auftragId: string): Promise<BaumZeile[]> {
  const [daten, positionen, reserviert] = await Promise.all([
    ladeBomDaten(db),
    ladeAuftragPositionen(db, auftragId),
    fremdeAeltereReservierungen(db, auftragId),
  ]);
  daten.bestand = effektiverBestand(daten.bestand, reserviert);
  return bedarfsbaumAusDaten(daten, positionen);
}

// ---------------------------------------------------------------------------
// Soll-Zeit (stücklisten- und lagerabhängig)
// ---------------------------------------------------------------------------

function zeitRekursiv(
  daten: BomDaten,
  artikelnummer: string,
  bedarf: number,
  packzeitSek: number,
  pfad: Set<string>
): number {
  const verfuegbar = daten.bestand.get(artikelnummer) ?? 0;
  const ausLager = Math.min(bedarf, verfuegbar);
  const restbedarf = bedarf - ausLager;

  // Lagerware: nur Abpackzeit, Kinder werden nicht aufgelöst.
  let sek = ausLager * packzeitSek;

  if (restbedarf > 0) {
    const vz = daten.vorgabezeit.get(artikelnummer);
    if (vz) sek += restbedarf * vz * 60; // Minuten/Stück → Sekunden
    for (const kind of daten.kinder.get(artikelnummer) ?? []) {
      if (pfad.has(kind.artikelnummer)) continue;
      sek += zeitRekursiv(daten, kind.artikelnummer, restbedarf * kind.menge, packzeitSek, new Set(pfad).add(artikelnummer));
    }
  }
  return sek;
}

export function sollSekundenNettoAusDaten(
  daten: BomDaten,
  positionen: AuftragPos[],
  packzeitMinuten: number
): number | null {
  const packzeitSek = packzeitMinuten * 60;
  let summe = 0;
  let beigetragen = false;

  for (const pos of positionen) {
    const hatStueckliste = (daten.kinder.get(pos.artikelnummer) ?? []).length > 0;
    if (hatStueckliste) {
      const sek = zeitRekursiv(daten, pos.artikelnummer, pos.menge, packzeitSek, new Set());
      if (sek > 0) {
        summe += sek;
        beigetragen = true;
      }
    } else {
      // Kein Stücklisten-Artikel: flache Vorgabezeit, Lagerbestand bleibt außen vor.
      const vz = daten.vorgabezeit.get(pos.artikelnummer);
      if (vz) {
        summe += pos.menge * vz * 60;
        beigetragen = true;
      }
    }
  }
  return beigetragen ? summe : null;
}

export async function sollSekundenNetto(
  db: Db,
  auftragId: string,
  packzeitMinuten: number = ABPACKZEIT_MINUTEN,
  sicht: BestandsSicht = "effektiv"
): Promise<number | null> {
  const [daten, positionen, reserviert] = await Promise.all([
    ladeBomDaten(db),
    ladeAuftragPositionen(db, auftragId),
    sicht === "effektiv" ? fremdeAeltereReservierungen(db, auftragId) : Promise.resolve(new Map<string, number>()),
  ]);
  if (sicht === "effektiv") {
    daten.bestand = effektiverBestand(daten.bestand, reserviert);
  }
  return sollSekundenNettoAusDaten(daten, positionen, packzeitMinuten);
}

// ---------------------------------------------------------------------------
// Stücklistenbaum lesen (Pflegeansicht)
// ---------------------------------------------------------------------------

export interface Kante {
  id: string;
  parentArtikel: string;
  kindArtikel: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  posNr: number;
  ebene: number;
}

/** Direkte Kinder einer Stückliste (V2: stueckliste_baum). */
export async function stuecklisteBaum(db: Db, artikelnummer: string) {
  const positionen = await db.stuecklistePosition.findMany({
    where: { parentArtikel: artikelnummer },
    include: { kind: { select: { bezeichnung: true, einheit: true } } },
    orderBy: [{ posNr: "asc" }, { kindArtikel: "asc" }],
  });
  return positionen.map((p) => ({
    id: p.id,
    kindArtikel: p.kindArtikel,
    bezeichnung: p.kind.bezeichnung,
    menge: p.menge,
    einheit: p.einheit || p.kind.einheit,
    posNr: p.posNr,
  }));
}

/**
 * Rohe Kantenliste des kompletten Teilbaums (alle Ebenen), BFS-Reihenfolge
 * wie V2 (ebene, posNr, kindArtikel) — jede Zeile behält ihre id zum Löschen.
 * Zyklusschutz über den Pfad.
 */
export async function stuecklisteKanten(db: Db, artikelnummer: string): Promise<Kante[]> {
  const rows = await db.stuecklistePosition.findMany({
    include: { kind: { select: { bezeichnung: true, einheit: true } } },
    orderBy: [{ posNr: "asc" }, { kindArtikel: "asc" }],
  });
  const proParent = new Map<string, typeof rows>();
  for (const r of rows) {
    const liste = proParent.get(r.parentArtikel) ?? [];
    liste.push(r);
    proParent.set(r.parentArtikel, liste);
  }

  const ergebnis: Kante[] = [];
  let aktuelleEbene: Array<{ artikel: string; pfad: Set<string> }> = [
    { artikel: artikelnummer, pfad: new Set([artikelnummer]) },
  ];
  let ebene = 1;
  while (aktuelleEbene.length > 0) {
    const naechste: Array<{ artikel: string; pfad: Set<string> }> = [];
    for (const knoten of aktuelleEbene) {
      for (const r of proParent.get(knoten.artikel) ?? []) {
        if (knoten.pfad.has(r.kindArtikel)) continue;
        ergebnis.push({
          id: r.id,
          parentArtikel: r.parentArtikel,
          kindArtikel: r.kindArtikel,
          bezeichnung: r.kind.bezeichnung,
          menge: r.menge,
          einheit: r.einheit || r.kind.einheit,
          posNr: r.posNr,
          ebene,
        });
        naechste.push({ artikel: r.kindArtikel, pfad: new Set(knoten.pfad).add(r.kindArtikel) });
      }
    }
    aktuelleEbene = naechste;
    ebene += 1;
  }
  return ergebnis;
}

/** Vollständige rekursive Auflösung, gleiche Artikel summiert (V2: stueckliste_rekursiv). */
export async function stuecklisteRekursiv(db: Db, artikelnummer: string) {
  const kanten = await stuecklisteKanten(db, artikelnummer);
  // Mengen entlang des Baums multiplizieren: Kanten sind BFS-sortiert, der
  // Multiplikator eines Kinds ergibt sich aus der bereits berechneten Parent-Zeile.
  // Einfacher: DFS direkt über die Kinder-Struktur.
  const daten = await ladeBomDaten(db);
  const sammler = new Map<string, { kindArtikel: string; bezeichnung: string; einheit: string; mengeGesamt: number; ebene: number }>();

  function dfs(nr: string, faktor: number, ebene: number, pfad: Set<string>) {
    for (const kind of daten.kinder.get(nr) ?? []) {
      if (pfad.has(kind.artikelnummer)) continue;
      const menge = faktor * kind.menge;
      const vorhanden = sammler.get(kind.artikelnummer);
      if (vorhanden) {
        vorhanden.mengeGesamt += menge;
        vorhanden.ebene = Math.min(vorhanden.ebene, ebene);
      } else {
        sammler.set(kind.artikelnummer, {
          kindArtikel: kind.artikelnummer,
          bezeichnung: kind.bezeichnung,
          einheit: kind.einheit,
          mengeGesamt: menge,
          ebene,
        });
      }
      dfs(kind.artikelnummer, menge, ebene + 1, new Set(pfad).add(kind.artikelnummer));
    }
  }
  dfs(artikelnummer, 1, 1, new Set([artikelnummer]));

  return [...sammler.values()].sort(
    (a, b) => a.ebene - b.ebene || a.kindArtikel.localeCompare(b.kindArtikel)
  );
}

/** Prüft, ob `ziel` im Teilbaum unter `start` erreichbar ist (Zyklen-Check beim Anlegen). */
export async function istErreichbar(db: Db, start: string, ziel: string): Promise<boolean> {
  if (start === ziel) return true;
  const rows = await db.stuecklistePosition.findMany({
    select: { parentArtikel: true, kindArtikel: true },
  });
  const proParent = new Map<string, string[]>();
  for (const r of rows) {
    const liste = proParent.get(r.parentArtikel) ?? [];
    liste.push(r.kindArtikel);
    proParent.set(r.parentArtikel, liste);
  }
  const besucht = new Set<string>([start]);
  const stapel = [start];
  while (stapel.length > 0) {
    const aktuell = stapel.pop() as string;
    for (const kind of proParent.get(aktuell) ?? []) {
      if (kind === ziel) return true;
      if (!besucht.has(kind)) {
        besucht.add(kind);
        stapel.push(kind);
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Buchungen (innerhalb einer Transaktion aufrufen)
// ---------------------------------------------------------------------------

/** Bucht Entnahmen für einen Auftrag basierend auf dem Nettobedarf (V2: entnahmen_buchen). */
export async function entnahmenBuchen(
  tx: Db,
  auftragId: string,
  benutzerId: string,
  lagerortId: string,
  bedarf?: NettobedarfResult
): Promise<Array<{ artikelnummer: string; menge: number; typ: string }>> {
  const result = bedarf ?? (await nettobedarfFuerAuftrag(tx, auftragId));
  const gebucht: Array<{ artikelnummer: string; menge: number; typ: string }> = [];

  for (const pos of result.positionen) {
    // Aus Lager entnehmen (fertige Baugruppen + Einzelteile)
    const mengeEntnahme = pos.ausLager > 0 ? pos.ausLager : pos.nettobedarf;
    if (mengeEntnahme <= 0) continue;

    await tx.materialbewegung.create({
      data: {
        artikelnummer: pos.artikelnummer,
        lagerortId,
        art: "entnahme",
        menge: -mengeEntnahme, // negativ = Abbuchung
        auftragId,
        benutzerId,
        bemerkung: "Kommissionierung",
      },
    });
    gebucht.push({ artikelnummer: pos.artikelnummer, menge: mengeEntnahme, typ: pos.typ });
  }
  return gebucht;
}

/**
 * Friert die aufgelöste Stückliste eines Auftrags ein (ISO 7.5, KF3-28).
 * Direkt neben entnahmenBuchen aufrufen — die Bedarfsberechnung liegt dort
 * ohnehin schon vor. Re-Kommissionierung überschreibt den alten Stand.
 */
export async function materialSnapshotSchreiben(
  tx: Db,
  auftragId: string,
  bedarf?: NettobedarfResult
): Promise<void> {
  const result = bedarf ?? (await nettobedarfFuerAuftrag(tx, auftragId));
  await tx.auftragMaterialSnapshot.deleteMany({ where: { auftragId } });
  if (result.positionen.length === 0) return;
  await tx.auftragMaterialSnapshot.createMany({
    data: result.positionen.map((p) => ({
      auftragId,
      artikelnummer: p.artikelnummer,
      bezeichnung: p.bezeichnung,
      einheit: p.einheit,
      bruttobedarf: p.bruttobedarf,
      bestand: p.bestand,
      nettobedarf: p.nettobedarf,
      ausLager: p.ausLager,
      typ: p.typ,
    })),
  });
}

/** Fertigmeldung eines L-Auftrags: Fertigprodukt-Zugang ins Lager (V2: fertigmeldung_buchen). */
export async function fertigmeldungBuchen(
  tx: Db,
  auftragId: string,
  benutzerId: string,
  lagerortId: string
): Promise<Array<{ artikelnummer: string; menge: number }>> {
  const positionen = await tx.auftragPosition.findMany({
    where: { auftragId, artikelnummer: { not: null } },
  });
  const gebucht: Array<{ artikelnummer: string; menge: number }> = [];
  for (const pos of positionen) {
    await tx.materialbewegung.create({
      data: {
        artikelnummer: pos.artikelnummer as string,
        lagerortId,
        art: "fertigmeldung",
        menge: pos.menge, // positiv = Zugang
        auftragId,
        benutzerId,
        bemerkung: "Fertigmeldung",
      },
    });
    gebucht.push({ artikelnummer: pos.artikelnummer as string, menge: pos.menge });
  }
  return gebucht;
}

/** Löscht alle Fertigmeldungs-Buchungen eines Auftrags (bei Reaktivierung). */
export async function fertigmeldungStornieren(tx: Db, auftragId: string): Promise<void> {
  await tx.materialbewegung.deleteMany({ where: { auftragId, art: "fertigmeldung" } });
}
