/**
 * Nachmigration / Drift-Sync V2 → V3 (idempotent, beliebig oft ausführbar).
 *
 * Zieht alles nach, was sich in der produktiven V2 seit der Erstmigration
 * geändert hat — auch geeignet für den finalen Cutover-Lauf:
 *   - Stammdaten werden AKTUALISIERT (V2 ist führend): Artikel, Lagerorte,
 *     Mitarbeiter, Zeitkategorien, Aufträge (inkl. Status/KPI-Feldern).
 *   - Bewegungsdaten werden ERGÄNZT (insert-missing by id): Zeiten,
 *     Materialbewegungen, Qualität, Inventur, Checks, importierte Belege.
 *   - Neue V2-Tabellen (≥2.39): auftrag_mitarbeiter (Arbeitsvorrat),
 *     auftrag_packmass — vollständiger Upsert.
 *   - V3-eigene Datensätze (z. B. admin-Benutzer, eigene Buchungen) bleiben.
 *   - Dateien (Inhalte liegen auf dem Pi) werden NICHT kopiert — Beleg-PDFs
 *     hängt der V3-Beleg-Import selbst an; Fotos ggf. separat per rsync.
 *
 * Voraussetzungen: SSH-Tunnel auf Port 5435 (V2-DB), lokale V3-DB Port 51214.
 * Aufruf: npx tsx migration/sync_v2_drift.ts
 */
import { Pool } from "pg";

const v2 = new Pool({ connectionString: process.env.V2_DATABASE_URL ?? "postgresql://kima:kima@localhost:5435/kimaflow" });
const v3 = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:51214/kimaflow?sslmode=disable" });

const stats: Record<string, { neu: number; aktualisiert: number }> = {};
function zaehle(tab: string, art: "neu" | "aktualisiert") {
  stats[tab] ??= { neu: 0, aktualisiert: 0 };
  stats[tab][art]++;
}

/** Upsert: insert … on conflict do update über die angegebenen Spalten. */
async function upsert(tab: string, pk: string[], spalten: string[], row: Record<string, unknown>) {
  const alle = [...pk, ...spalten];
  const platzhalter = alle.map((_, i) => `$${i + 1}`).join(",");
  const updates = spalten.map((s) => `${s} = EXCLUDED.${s}`).join(", ");
  const r = await v3.query(
    `INSERT INTO ${tab} (${alle.join(",")}) VALUES (${platzhalter})
     ON CONFLICT (${pk.join(",")}) DO UPDATE SET ${updates}
     RETURNING (xmax = 0) AS ist_neu`,
    alle.map((s) => row[s] ?? null)
  );
  zaehle(tab, r.rows[0].ist_neu ? "neu" : "aktualisiert");
}

/** Insert-missing: nur neue Zeilen, vorhandene bleiben unangetastet. */
async function insertMissing(tab: string, pk: string[], spalten: string[], row: Record<string, unknown>) {
  const alle = [...pk, ...spalten];
  const platzhalter = alle.map((_, i) => `$${i + 1}`).join(",");
  const r = await v3.query(
    `INSERT INTO ${tab} (${alle.join(",")}) VALUES (${platzhalter})
     ON CONFLICT (${pk.join(",")}) DO NOTHING`,
    alle.map((s) => row[s] ?? null)
  );
  if (r.rowCount === 1) zaehle(tab, "neu");
}

async function alleV2(tab: string): Promise<Record<string, unknown>[]> {
  return (await v2.query(`SELECT * FROM ${tab}`)).rows;
}

async function main() {
  console.log("Drift-Sync V2 → V3 …\n");

  // ── Stammdaten (V2 führend → Upsert) ────────────────────────────────
  for (const r of await alleV2("lagerort")) {
    await upsert("lagerort", ["id"], ["name", "kuerzel", "aktiv", "erstellt_am"], r);
  }

  for (const r of await alleV2("artikel")) {
    await upsert("artikel", ["artikelnummer"], [
      "bezeichnung", "langtext", "vorgabezeit", "ist_basissystem", "produktfamilie",
      "einheit", "mindestbestand", "lagerort_id", "bestand_aktiv", "gesperrt", "ungeprueft",
      "lagerplatz_reihe", "lagerplatz_regal", "lagerplatz_fach", "lagerplatz_platz", "erfasst_am",
    ], { ...r, bezeichnung: r.bezeichnung ?? r.artikelnummer, einheit: r.einheit ?? "Stk" });
  }

  for (const r of await alleV2("benutzer")) {
    // Username ist unique: existiert er in V3 unter anderer id (z. B. V3-eigener
    // admin), bleibt der V3-Datensatz unangetastet.
    const kollision = await v3.query(`SELECT 1 FROM benutzer WHERE username = $1 AND id <> $2`, [r.username, r.id]);
    if (kollision.rowCount) continue;
    await upsert("benutzer", ["id"], [
      "username", "name", "rolle", "passwort_hash", "aktiv", "muss_passwort_aendern", "rechte", "erstellt_am",
    ], { ...r, rechte: r.rechte != null ? JSON.stringify(r.rechte) : null });
  }

  for (const r of await alleV2("mitarbeiter")) {
    const kollision = await v3.query(`SELECT 1 FROM mitarbeiter WHERE kuerzel = $1 AND id <> $2`, [r.kuerzel, r.id]);
    if (kollision.rowCount) continue;
    await upsert("mitarbeiter", ["id"], ["name", "kuerzel", "status", "benutzer_id", "erstellt_am"],
      { ...r, status: r.status ?? "aktiv" });
  }

  for (const r of await alleV2("zeitkategorie")) {
    const kollision = await v3.query(`SELECT 1 FROM zeitkategorie WHERE name = $1 AND id <> $2`, [r.name, r.id]);
    if (kollision.rowCount) continue;
    await upsert("zeitkategorie", ["id"], ["name", "sortorder", "erstellt_am"],
      { ...r, sortorder: r.sortorder ?? 0 });
  }

  // ── Aufträge: Stamm + Status (V2 führend), Positionen komplett ersetzen ──
  const v2Auftraege = await alleV2("auftrag");
  for (const r of v2Auftraege) {
    // Hat der V3-Beleg-Import denselben Auftrag unabhängig angelegt (gleiche
    // AB-Nummer, andere id), gewinnt der V2-Datensatz — das Import-Duplikat
    // wird samt Beleg-Tracking entfernt, damit der nächste Import-Lauf die
    // PDF an den V2-Auftrag hängt.
    if (r.ab_nummer) {
      const dup = await v3.query(
        `SELECT id FROM auftrag WHERE ab_nummer = $1 AND id <> $2`, [r.ab_nummer, r.id]
      );
      for (const d of dup.rows) {
        await v3.query(`DELETE FROM importierter_beleg WHERE ab_nummer = $1`, [r.ab_nummer]);
        await v3.query(`DELETE FROM materialbewegung WHERE auftrag_id = $1`, [d.id]);
        await v3.query(`DELETE FROM auftrag WHERE id = $1`, [d.id]);
        zaehle("auftrag (Import-Duplikat entfernt)", "aktualisiert");
      }
    }
    await upsert("auftrag", ["id"], [
      "nummer", "bezeichnung", "menge", "status", "kunde", "liefertermin", "ab_nummer",
      "quelle", "produkt_manuell", "laenge", "breite", "hoehe", "gewicht", "pausengrund",
      "notiz", "plan_zeit_sekunden", "start", "ende", "promised_date", "promised_date_manuell",
      "rework_required", "rework_reason", "stalled_missing_parts", "stall_days",
      "kpi_ausgeschlossen", "erstellt_am",
    ], { ...r, bezeichnung: r.bezeichnung ?? "—", menge: r.menge ?? 1 });
  }

  // Positionen der V2-bekannten Aufträge spiegeln (delete + insert mit V2-ids)
  const v2AuftragIds = v2Auftraege.map((r) => r.id);
  await v3.query(`DELETE FROM auftrag_position WHERE auftrag_id = ANY($1)`, [v2AuftragIds]);
  for (const r of await alleV2("auftrag_position")) {
    await insertMissing("auftrag_position", ["id"],
      ["auftrag_id", "pos_nr", "artikelnummer", "bezeichnung", "menge", "einheit"],
      { ...r, pos_nr: r.pos_nr ?? 0, bezeichnung: r.bezeichnung ?? "—", einheit: r.einheit ?? "Stk" });
  }

  // ── Bewegungsdaten (V2 führend per Upsert bzw. Ergänzung) ───────────
  for (const r of await alleV2("auftragszeit")) {
    await upsert("auftragszeit", ["id"], [
      "mitarbeiter_id", "auftrag_id", "kategorie_id", "start", "ende", "beendet_durch",
      "ist_nachtrag", "ist_korrektur", "korrektur_minuten", "erstellt_am",
    ], r);
  }

  for (const r of await alleV2("materialbewegung")) {
    await insertMissing("materialbewegung", ["id"], [
      "artikelnummer", "lagerort_id", "lagerort_ziel_id", "art", "menge",
      "auftrag_id", "benutzer_id", "bemerkung", "gebucht_am",
    ], r);
  }

  for (const r of await alleV2("qualitaet")) {
    await insertMissing("qualitaet", ["id"],
      ["auftrag_id", "mitarbeiter_id", "gut", "ausschuss", "nacharbeit", "bemerkung", "zeitstempel"],
      { ...r, gut: r.gut ?? 0, ausschuss: r.ausschuss ?? 0, nacharbeit: r.nacharbeit ?? 0 });
  }

  for (const r of await alleV2("kommissionier_check")) {
    await upsert("kommissionier_check", ["auftrag_id", "artikelnummer"],
      ["abgehakt", "abgehakt_am", "abgehakt_von_id"], r);
  }

  for (const r of await alleV2("inventur_zaehlung")) {
    await upsert("inventur_zaehlung", ["id"], [
      "artikelnummer", "soll_menge", "ist_menge", "lagerort_id", "status", "bewegung_id",
      "notiz", "erfasst_von_id", "erfasst_am", "gebucht_von_id", "gebucht_am",
    ], r);
  }

  for (const r of await alleV2("importierter_beleg")) {
    await insertMissing("importierter_beleg", ["dateiname"],
      ["mtime", "size", "ab_nummer", "verarbeitet_am"],
      { ...r, mtime: new Date(Number(r.mtime) * 1000) }); // V2: float-Sekunden → V3: timestamp
  }

  // ── Neue V2-Tabellen (≥2.39) ────────────────────────────────────────
  for (const r of await alleV2("auftrag_mitarbeiter")) {
    await upsert("auftrag_mitarbeiter", ["auftrag_id", "mitarbeiter_id"],
      ["zugewiesen_am", "zugewiesen_von_id"], r);
  }

  for (const r of await alleV2("auftrag_packmass")) {
    await upsert("auftrag_packmass", ["id"],
      ["auftrag_id", "name", "laenge", "breite", "hoehe", "gewicht", "position"],
      { ...r, position: r.position ?? 0 });
  }

  console.log("\nErgebnis (neu / aktualisiert):");
  for (const [tab, s] of Object.entries(stats)) {
    console.log(`  ${tab.padEnd(22)} ${String(s.neu).padStart(4)} / ${s.aktualisiert}`);
  }
}

main()
  .catch((e) => {
    console.error("Sync fehlgeschlagen:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await v2.end();
    await v3.end();
  });
