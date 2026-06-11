-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Benutzerrolle" AS ENUM ('admin', 'kommissionierung', 'mitarbeiter');

-- CreateEnum
CREATE TYPE "Auftragsstatus" AS ENUM ('offen', 'kommissioniert', 'laeuft', 'pausiert', 'abgeschlossen');

-- CreateEnum
CREATE TYPE "Materialbewegungsart" AS ENUM ('wareneingang', 'entnahme', 'umlagerung', 'inventur', 'korrektur', 'fertigmeldung');

-- CreateEnum
CREATE TYPE "Inventurstatus" AS ENUM ('erfasst', 'gebucht', 'verworfen');

-- CreateEnum
CREATE TYPE "Zeitbeendigungsgrund" AS ENUM ('normal', 'pause', 'nachtrag');

-- CreateTable
CREATE TABLE "benutzer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "rolle" "Benutzerrolle" NOT NULL,
    "passwort_hash" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "muss_passwort_aendern" BOOLEAN NOT NULL DEFAULT false,
    "rechte" JSONB,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benutzer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "token" TEXT NOT NULL,
    "benutzer_id" TEXT NOT NULL,
    "laeuft_ab" TIMESTAMP(3) NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "mitarbeiter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kuerzel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aktiv',
    "benutzer_id" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mitarbeiter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lagerort" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kuerzel" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lagerort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artikel" (
    "artikelnummer" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "langtext" TEXT,
    "vorgabezeit" DOUBLE PRECISION,
    "ist_basissystem" BOOLEAN NOT NULL DEFAULT false,
    "produktfamilie" TEXT,
    "einheit" TEXT NOT NULL DEFAULT 'Stk',
    "mindestbestand" DOUBLE PRECISION,
    "lagerort_id" TEXT,
    "bestand_aktiv" BOOLEAN NOT NULL DEFAULT true,
    "gesperrt" BOOLEAN NOT NULL DEFAULT false,
    "ungeprueft" BOOLEAN NOT NULL DEFAULT false,
    "lagerplatz_reihe" TEXT,
    "lagerplatz_regal" TEXT,
    "lagerplatz_fach" TEXT,
    "lagerplatz_platz" TEXT,
    "erfasst_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artikel_pkey" PRIMARY KEY ("artikelnummer")
);

-- CreateTable
CREATE TABLE "stueckliste_position" (
    "id" TEXT NOT NULL,
    "parent_artikel" TEXT NOT NULL,
    "kind_artikel" TEXT NOT NULL,
    "menge" DOUBLE PRECISION NOT NULL,
    "einheit" TEXT NOT NULL DEFAULT 'Stk',
    "pos_nr" INTEGER NOT NULL,

    CONSTRAINT "stueckliste_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auftrag" (
    "id" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "menge" DOUBLE PRECISION NOT NULL,
    "status" "Auftragsstatus" NOT NULL DEFAULT 'offen',
    "kunde" TEXT,
    "liefertermin" TEXT,
    "ab_nummer" TEXT,
    "quelle" TEXT,
    "produkt_manuell" BOOLEAN NOT NULL DEFAULT false,
    "laenge" DOUBLE PRECISION,
    "breite" DOUBLE PRECISION,
    "hoehe" DOUBLE PRECISION,
    "gewicht" DOUBLE PRECISION,
    "pausengrund" TEXT,
    "notiz" TEXT,
    "plan_zeit_sekunden" INTEGER,
    "start" TIMESTAMP(3),
    "ende" TIMESTAMP(3),
    "promised_date" TIMESTAMP(3),
    "promised_date_manuell" BOOLEAN NOT NULL DEFAULT false,
    "rework_required" BOOLEAN NOT NULL DEFAULT false,
    "rework_reason" TEXT,
    "stalled_missing_parts" BOOLEAN NOT NULL DEFAULT false,
    "stall_days" INTEGER,
    "kpi_ausgeschlossen" BOOLEAN NOT NULL DEFAULT false,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auftrag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auftrag_mitarbeiter" (
    "auftrag_id" TEXT NOT NULL,
    "mitarbeiter_id" TEXT NOT NULL,
    "zugewiesen_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "zugewiesen_von_id" TEXT,

    CONSTRAINT "auftrag_mitarbeiter_pkey" PRIMARY KEY ("auftrag_id","mitarbeiter_id")
);

-- CreateTable
CREATE TABLE "auftrag_packmass" (
    "id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "name" TEXT,
    "laenge" DOUBLE PRECISION,
    "breite" DOUBLE PRECISION,
    "hoehe" DOUBLE PRECISION,
    "gewicht" DOUBLE PRECISION,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "auftrag_packmass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auftrag_position" (
    "id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "pos_nr" INTEGER NOT NULL,
    "artikelnummer" TEXT,
    "bezeichnung" TEXT NOT NULL,
    "menge" DOUBLE PRECISION NOT NULL,
    "einheit" TEXT NOT NULL DEFAULT 'Stk',

    CONSTRAINT "auftrag_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zeitkategorie" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortorder" INTEGER NOT NULL DEFAULT 0,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zeitkategorie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auftragszeit" (
    "id" TEXT NOT NULL,
    "mitarbeiter_id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "kategorie_id" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "ende" TIMESTAMP(3),
    "beendet_durch" "Zeitbeendigungsgrund",
    "ist_nachtrag" BOOLEAN NOT NULL DEFAULT false,
    "ist_korrektur" BOOLEAN NOT NULL DEFAULT false,
    "korrektur_minuten" DOUBLE PRECISION,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auftragszeit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualitaet" (
    "id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "mitarbeiter_id" TEXT,
    "gut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ausschuss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nacharbeit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bemerkung" TEXT,
    "zeitstempel" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qualitaet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datei" (
    "id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimetype" TEXT NOT NULL,
    "quelle" TEXT,
    "speicherpfad" TEXT NOT NULL,
    "hinzugefuegt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "datei_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importierter_beleg" (
    "dateiname" TEXT NOT NULL,
    "mtime" TIMESTAMP(3) NOT NULL,
    "size" INTEGER NOT NULL,
    "ab_nummer" TEXT,
    "verarbeitet_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importierter_beleg_pkey" PRIMARY KEY ("dateiname")
);

-- CreateTable
CREATE TABLE "materialbewegung" (
    "id" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "lagerort_id" TEXT NOT NULL,
    "lagerort_ziel_id" TEXT,
    "art" "Materialbewegungsart" NOT NULL,
    "menge" DOUBLE PRECISION NOT NULL,
    "auftrag_id" TEXT,
    "benutzer_id" TEXT,
    "bemerkung" TEXT,
    "gebucht_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "einstandspreis" DECIMAL(10,4),
    "kostenstelle" TEXT,
    "kostentraeger" TEXT,

    CONSTRAINT "materialbewegung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventur_zaehlung" (
    "id" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "soll_menge" DOUBLE PRECISION NOT NULL,
    "ist_menge" DOUBLE PRECISION,
    "lagerort_id" TEXT,
    "status" "Inventurstatus" NOT NULL DEFAULT 'erfasst',
    "bewegung_id" TEXT,
    "notiz" TEXT,
    "erfasst_von_id" TEXT,
    "erfasst_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gebucht_von_id" TEXT,
    "gebucht_am" TIMESTAMP(3),

    CONSTRAINT "inventur_zaehlung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kommissionier_check" (
    "auftrag_id" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "abgehakt" BOOLEAN NOT NULL DEFAULT false,
    "abgehakt_am" TIMESTAMP(3),
    "abgehakt_von_id" TEXT,

    CONSTRAINT "kommissionier_check_pkey" PRIMARY KEY ("auftrag_id","artikelnummer")
);

-- CreateTable
CREATE TABLE "lieferant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kontakt" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "lieferzeit_tage" INTEGER NOT NULL DEFAULT 7,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lieferant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artikel_lieferant" (
    "id" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "lieferant_id" TEXT NOT NULL,
    "einkaufspreis" DECIMAL(10,4) NOT NULL,
    "mindestmenge" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "bestellkosten" DECIMAL(10,2),
    "lagerkostensatz" DECIMAL(10,4),
    "jahresbedarf" DOUBLE PRECISION,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artikel_lieferant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auftrag_zuweisung" (
    "id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "mitarbeiter_id" TEXT NOT NULL,
    "geplant_von" TIMESTAMP(3) NOT NULL,
    "geplant_bis" TIMESTAMP(3) NOT NULL,
    "notiz" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auftrag_zuweisung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "benutzer_username_key" ON "benutzer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "mitarbeiter_kuerzel_key" ON "mitarbeiter"("kuerzel");

-- CreateIndex
CREATE UNIQUE INDEX "mitarbeiter_benutzer_id_key" ON "mitarbeiter"("benutzer_id");

-- CreateIndex
CREATE UNIQUE INDEX "lagerort_name_key" ON "lagerort"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stueckliste_position_parent_artikel_kind_artikel_key" ON "stueckliste_position"("parent_artikel", "kind_artikel");

-- CreateIndex
CREATE INDEX "auftrag_status_idx" ON "auftrag"("status");

-- CreateIndex
CREATE INDEX "auftrag_nummer_idx" ON "auftrag"("nummer");

-- CreateIndex
CREATE UNIQUE INDEX "zeitkategorie_name_key" ON "zeitkategorie"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventur_zaehlung_bewegung_id_key" ON "inventur_zaehlung"("bewegung_id");

-- CreateIndex
CREATE UNIQUE INDEX "lieferant_name_key" ON "lieferant"("name");

-- CreateIndex
CREATE UNIQUE INDEX "artikel_lieferant_artikelnummer_lieferant_id_key" ON "artikel_lieferant"("artikelnummer", "lieferant_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_benutzer_id_fkey" FOREIGN KEY ("benutzer_id") REFERENCES "benutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mitarbeiter" ADD CONSTRAINT "mitarbeiter_benutzer_id_fkey" FOREIGN KEY ("benutzer_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artikel" ADD CONSTRAINT "artikel_lagerort_id_fkey" FOREIGN KEY ("lagerort_id") REFERENCES "lagerort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stueckliste_position" ADD CONSTRAINT "stueckliste_position_parent_artikel_fkey" FOREIGN KEY ("parent_artikel") REFERENCES "artikel"("artikelnummer") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stueckliste_position" ADD CONSTRAINT "stueckliste_position_kind_artikel_fkey" FOREIGN KEY ("kind_artikel") REFERENCES "artikel"("artikelnummer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_mitarbeiter" ADD CONSTRAINT "auftrag_mitarbeiter_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_mitarbeiter" ADD CONSTRAINT "auftrag_mitarbeiter_mitarbeiter_id_fkey" FOREIGN KEY ("mitarbeiter_id") REFERENCES "mitarbeiter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_mitarbeiter" ADD CONSTRAINT "auftrag_mitarbeiter_zugewiesen_von_id_fkey" FOREIGN KEY ("zugewiesen_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_packmass" ADD CONSTRAINT "auftrag_packmass_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_position" ADD CONSTRAINT "auftrag_position_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_position" ADD CONSTRAINT "auftrag_position_artikelnummer_fkey" FOREIGN KEY ("artikelnummer") REFERENCES "artikel"("artikelnummer") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftragszeit" ADD CONSTRAINT "auftragszeit_mitarbeiter_id_fkey" FOREIGN KEY ("mitarbeiter_id") REFERENCES "mitarbeiter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftragszeit" ADD CONSTRAINT "auftragszeit_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftragszeit" ADD CONSTRAINT "auftragszeit_kategorie_id_fkey" FOREIGN KEY ("kategorie_id") REFERENCES "zeitkategorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualitaet" ADD CONSTRAINT "qualitaet_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualitaet" ADD CONSTRAINT "qualitaet_mitarbeiter_id_fkey" FOREIGN KEY ("mitarbeiter_id") REFERENCES "mitarbeiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datei" ADD CONSTRAINT "datei_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materialbewegung" ADD CONSTRAINT "materialbewegung_artikelnummer_fkey" FOREIGN KEY ("artikelnummer") REFERENCES "artikel"("artikelnummer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materialbewegung" ADD CONSTRAINT "materialbewegung_lagerort_id_fkey" FOREIGN KEY ("lagerort_id") REFERENCES "lagerort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materialbewegung" ADD CONSTRAINT "materialbewegung_lagerort_ziel_id_fkey" FOREIGN KEY ("lagerort_ziel_id") REFERENCES "lagerort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materialbewegung" ADD CONSTRAINT "materialbewegung_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materialbewegung" ADD CONSTRAINT "materialbewegung_benutzer_id_fkey" FOREIGN KEY ("benutzer_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventur_zaehlung" ADD CONSTRAINT "inventur_zaehlung_artikelnummer_fkey" FOREIGN KEY ("artikelnummer") REFERENCES "artikel"("artikelnummer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventur_zaehlung" ADD CONSTRAINT "inventur_zaehlung_lagerort_id_fkey" FOREIGN KEY ("lagerort_id") REFERENCES "lagerort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventur_zaehlung" ADD CONSTRAINT "inventur_zaehlung_bewegung_id_fkey" FOREIGN KEY ("bewegung_id") REFERENCES "materialbewegung"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventur_zaehlung" ADD CONSTRAINT "inventur_zaehlung_erfasst_von_id_fkey" FOREIGN KEY ("erfasst_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventur_zaehlung" ADD CONSTRAINT "inventur_zaehlung_gebucht_von_id_fkey" FOREIGN KEY ("gebucht_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kommissionier_check" ADD CONSTRAINT "kommissionier_check_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kommissionier_check" ADD CONSTRAINT "kommissionier_check_artikelnummer_fkey" FOREIGN KEY ("artikelnummer") REFERENCES "artikel"("artikelnummer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kommissionier_check" ADD CONSTRAINT "kommissionier_check_abgehakt_von_id_fkey" FOREIGN KEY ("abgehakt_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artikel_lieferant" ADD CONSTRAINT "artikel_lieferant_artikelnummer_fkey" FOREIGN KEY ("artikelnummer") REFERENCES "artikel"("artikelnummer") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artikel_lieferant" ADD CONSTRAINT "artikel_lieferant_lieferant_id_fkey" FOREIGN KEY ("lieferant_id") REFERENCES "lieferant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_zuweisung" ADD CONSTRAINT "auftrag_zuweisung_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag_zuweisung" ADD CONSTRAINT "auftrag_zuweisung_mitarbeiter_id_fkey" FOREIGN KEY ("mitarbeiter_id") REFERENCES "mitarbeiter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

