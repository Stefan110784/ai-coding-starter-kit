/**
 * KIMA-Flow V2 → V3 Datenmigration (Raw SQL Version)
 *
 * Ausführung:
 *   DATABASE_V2=postgresql://kima:kima@localhost:5435/kimaflow \
 *   DATABASE_URL=postgres://postgres:postgres@localhost:51214/kimaflow?sslmode=disable \
 *   npx tsx migration/migrate_v2_to_v3.ts
 */

import { Client, Pool } from "pg";

const V2_URL = process.env.DATABASE_V2;
const V3_URL = process.env.DATABASE_URL;

if (!V2_URL || !V3_URL) {
  console.error("❌  DATABASE_V2 und DATABASE_URL müssen gesetzt sein");
  process.exit(1);
}

const v2 = new Client({ connectionString: V2_URL });
const v3 = new Pool({
  connectionString: V3_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

let inserted = 0;
let skipped = 0;
let errors = 0;

async function insert(sql: string, values: unknown[]): Promise<boolean> {
  try {
    const result = await v3.query(sql, values);
    if (result.rowCount && result.rowCount > 0) {
      inserted++;
      return true;
    } else {
      skipped++; // ON CONFLICT DO NOTHING
      return false;
    }
  } catch (e: any) {
    errors++;
    console.error(`  ⚠ INSERT Fehler: ${e.message?.split("\n")[0]}`);
    return false;
  }
}

async function migrateZeitkategorien() {
  const { rows } = await v2.query("SELECT * FROM zeitkategorie ORDER BY sortorder");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO zeitkategorie (id, name, sortorder, erstellt_am) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.sortorder, r.erstellt_am]
    );
    n++;
  }
  console.log(`  ✓ Zeitkategorien: ${n}`);
}

async function migrateLagerorte() {
  const { rows } = await v2.query("SELECT * FROM lagerort");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO lagerort (id, name, kuerzel, aktiv, erstellt_am) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.kuerzel, r.aktiv, r.erstellt_am]
    );
    n++;
  }
  console.log(`  ✓ Lagerorte: ${n}`);
}

async function migrateArtikel() {
  const { rows } = await v2.query("SELECT * FROM artikel ORDER BY artikelnummer");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO artikel (artikelnummer, bezeichnung, langtext, vorgabezeit, ist_basissystem,
        produktfamilie, einheit, mindestbestand, lagerort_id, bestand_aktiv, gesperrt, ungeprueft,
        lagerplatz_reihe, lagerplatz_regal, lagerplatz_fach, lagerplatz_platz, erfasst_am)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (artikelnummer) DO NOTHING`,
      [
        r.artikelnummer, r.bezeichnung, r.langtext, r.vorgabezeit, r.ist_basissystem ?? false,
        r.produktfamilie, r.einheit ?? "Stk", r.mindestbestand, r.lagerort_id,
        r.bestand_aktiv ?? true, r.gesperrt ?? false, r.ungeprueft ?? false,
        r.lagerplatz_reihe, r.lagerplatz_regal, r.lagerplatz_fach, r.lagerplatz_platz, r.erfasst_am,
      ]
    );
    n++;
  }
  console.log(`  ✓ Artikel: ${n}`);
}

async function migrateStuecklisten() {
  const { rows } = await v2.query("SELECT * FROM stueckliste_position");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO stueckliste_position (id, parent_artikel, kind_artikel, menge, einheit, pos_nr)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.parent_artikel, r.kind_artikel, r.menge, r.einheit ?? "Stk", r.pos_nr ?? 0]
    );
    n++;
  }
  console.log(`  ✓ Stücklisten: ${n}`);
}

async function migrateBenutzer() {
  const { rows } = await v2.query("SELECT * FROM benutzer");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO benutzer (id, username, name, rolle, passwort_hash, aktiv, muss_passwort_aendern, rechte, erstellt_am)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [
        r.id, r.username, r.name, r.rolle, r.passwort_hash,
        r.aktiv ?? true, r.muss_passwort_aendern ?? false,
        r.rechte ? JSON.stringify(r.rechte) : null, r.erstellt_am,
      ]
    );
    n++;
  }
  console.log(`  ✓ Benutzer: ${n}`);
}

async function migrateMitarbeiter() {
  const { rows } = await v2.query("SELECT * FROM mitarbeiter");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO mitarbeiter (id, name, kuerzel, status, benutzer_id, erstellt_am)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.kuerzel, r.status ?? "aktiv", r.benutzer_id, r.erstellt_am]
    );
    n++;
  }
  console.log(`  ✓ Mitarbeiter: ${n}`);
}

async function migrateAuftraege() {
  const { rows } = await v2.query("SELECT * FROM auftrag ORDER BY erstellt_am");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO auftrag (id, nummer, bezeichnung, menge, status, kunde, liefertermin, ab_nummer,
        quelle, produkt_manuell, laenge, breite, hoehe, gewicht, pausengrund, notiz,
        plan_zeit_sekunden, start, ende, promised_date, promised_date_manuell,
        rework_required, rework_reason, stalled_missing_parts, stall_days,
        kpi_ausgeschlossen, erstellt_am)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id, r.nummer, r.bezeichnung, r.menge ?? 0, r.status, r.kunde, r.liefertermin, r.ab_nummer,
        r.quelle, r.produkt_manuell ?? false, r.laenge, r.breite, r.hoehe, r.gewicht,
        r.pausengrund, r.notiz, r.plan_zeit_sekunden, r.start, r.ende, r.promised_date,
        r.promised_date_manuell ?? false, r.rework_required ?? false, r.rework_reason,
        r.stalled_missing_parts ?? false, r.stall_days, r.kpi_ausgeschlossen ?? false, r.erstellt_am,
      ]
    );
    n++;
  }
  console.log(`  ✓ Aufträge: ${n}`);
}

async function migrateAuftragPositionen() {
  const { rows } = await v2.query("SELECT * FROM auftrag_position");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO auftrag_position (id, auftrag_id, pos_nr, artikelnummer, bezeichnung, menge, einheit)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.auftrag_id, r.pos_nr ?? 0, r.artikelnummer, r.bezeichnung, r.menge, r.einheit ?? "Stk"]
    );
    n++;
  }
  console.log(`  ✓ Auftragspositionen: ${n}`);
}

async function migrateAuftragszeiten() {
  const { rows } = await v2.query("SELECT * FROM auftragszeit ORDER BY start");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO auftragszeit (id, mitarbeiter_id, auftrag_id, kategorie_id, start, ende,
        beendet_durch, ist_nachtrag, ist_korrektur, korrektur_minuten, erstellt_am)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [
        r.id, r.mitarbeiter_id, r.auftrag_id, r.kategorie_id, r.start, r.ende,
        r.beendet_durch, r.ist_nachtrag ?? false, r.ist_korrektur ?? false,
        r.korrektur_minuten, r.erstellt_am,
      ]
    );
    n++;
  }
  console.log(`  ✓ Auftragszeiten: ${n}`);
}

async function migrateMaterialbewegungen() {
  const { rows } = await v2.query("SELECT * FROM materialbewegung ORDER BY gebucht_am");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO materialbewegung (id, artikelnummer, lagerort_id, lagerort_ziel_id, art, menge,
        auftrag_id, benutzer_id, bemerkung, gebucht_am)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [
        r.id, r.artikelnummer, r.lagerort_id, r.lagerort_ziel_id, r.art, r.menge,
        r.auftrag_id, r.benutzer_id, r.bemerkung, r.gebucht_am,
      ]
    );
    n++;
  }
  console.log(`  ✓ Materialbewegungen: ${n}`);
}

async function migrateInventurZaehlungen() {
  const { rows } = await v2.query("SELECT * FROM inventur_zaehlung ORDER BY erfasst_am");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO inventur_zaehlung (id, artikelnummer, soll_menge, ist_menge, lagerort_id, status,
        bewegung_id, notiz, erfasst_von_id, erfasst_am, gebucht_von_id, gebucht_am)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [
        r.id, r.artikelnummer, r.soll_menge, r.ist_menge, r.lagerort_id, r.status,
        r.bewegung_id, r.notiz, r.erfasst_von_id, r.erfasst_am, r.gebucht_von_id, r.gebucht_am,
      ]
    );
    n++;
  }
  console.log(`  ✓ Inventurzählungen: ${n}`);
}

async function migrateKommissionierChecks() {
  const { rows } = await v2.query("SELECT * FROM kommissionier_check");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO kommissionier_check (auftrag_id, artikelnummer, abgehakt, abgehakt_am, abgehakt_von_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (auftrag_id, artikelnummer) DO NOTHING`,
      [r.auftrag_id, r.artikelnummer, r.abgehakt ?? false, r.abgehakt_am, r.abgehakt_von_id]
    );
    n++;
  }
  console.log(`  ✓ Kommissionier-Checks: ${n}`);
}

async function migrateQualitaet() {
  const { rows } = await v2.query("SELECT * FROM qualitaet ORDER BY zeitstempel");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO qualitaet (id, auftrag_id, mitarbeiter_id, gut, ausschuss, nacharbeit, bemerkung, zeitstempel)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.auftrag_id, r.mitarbeiter_id, r.gut ?? 0, r.ausschuss ?? 0, r.nacharbeit ?? 0, r.bemerkung, r.zeitstempel]
    );
    n++;
  }
  console.log(`  ✓ Qualität: ${n}`);
}

async function migrateDateien() {
  const { rows } = await v2.query("SELECT * FROM datei");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO datei (id, auftrag_id, name, size, mimetype, quelle, speicherpfad, hinzugefuegt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [r.id, r.auftrag_id, r.name, r.size, r.mimetype, r.quelle, r.speicherpfad, r.hinzugefuegt]
    );
    n++;
  }
  console.log(`  ✓ Dateien: ${n}`);
}

async function migrateImportBelege() {
  const { rows } = await v2.query("SELECT * FROM importierter_beleg");
  let n = 0;
  for (const r of rows) {
    await insert(
      `INSERT INTO importierter_beleg (dateiname, mtime, size, ab_nummer, verarbeitet_am)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dateiname) DO NOTHING`,
      [r.dateiname, new Date(r.mtime * 1000), r.size, r.ab_nummer, r.verarbeitet_am]
    );
    n++;
  }
  console.log(`  ✓ Importierte Belege: ${n}`);
}

async function main() {
  console.log("🚀  KIMA-Flow V2 → V3 Migration (Raw SQL)");
  console.log(`   V2: ${V2_URL}`);
  console.log(`   V3: ${V3_URL}`);
  console.log("");

  await v2.connect();
  console.log("📦  V2-Datenbankverbindung OK");

  // Test V3 connection
  await v3.query("SELECT 1");
  console.log("📦  V3-Datenbankverbindung OK\n");

  console.log("⏳  Migriere...");

  await migrateZeitkategorien();
  await migrateLagerorte();
  await migrateArtikel();
  await migrateStuecklisten();
  await migrateBenutzer();
  await migrateMitarbeiter();
  await migrateAuftraege();
  await migrateAuftragPositionen();
  await migrateAuftragszeiten();
  await migrateMaterialbewegungen();
  await migrateInventurZaehlungen();
  await migrateKommissionierChecks();
  await migrateQualitaet();
  await migrateDateien();
  await migrateImportBelege();

  console.log(`\n✅  Migration abgeschlossen`);
  console.log(`   Neu eingefügt: ${inserted}`);
  console.log(`   Übersprungen (bereits vorhanden): ${skipped}`);
  if (errors > 0) console.log(`   ⚠ Fehler: ${errors}`);
  console.log(`\n⚠️  Physische Dateien (data/files/ und data/belege/)`);
  console.log(`   müssen manuell vom V2-Server kopiert werden:`);
  console.log(`   rsync -av bdeadmin@10.100.82.109:/opt/kimaflow/data/ ./data/`);

  await v2.end();
  await v3.end();
}

main().catch((e) => {
  console.error("❌  Fataler Fehler:", e.message);
  process.exit(1);
});
