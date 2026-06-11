-- CreateEnum
CREATE TYPE "FuenfSKategorie" AS ENUM ('seiri', 'seiton', 'seiso', 'seiketsu', 'shitsuke');

-- CreateEnum
CREATE TYPE "FuenfSAuditStatus" AS ENUM ('entwurf', 'abgeschlossen');

-- AlterEnum
ALTER TYPE "AbweichungTyp" ADD VALUE 'fuenfs';

-- AlterTable
ALTER TABLE "datei" ADD COLUMN     "fuenfs_bereich_id" TEXT,
ADD COLUMN     "fuenfs_position_id" TEXT,
ALTER COLUMN "auftrag_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "fuenfs_bereich" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verantwortlich_id" TEXT,
    "sortorder" INTEGER NOT NULL DEFAULT 0,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuenfs_bereich_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuenfs_checklisten_punkt" (
    "id" TEXT NOT NULL,
    "kategorie" "FuenfSKategorie" NOT NULL,
    "text" TEXT NOT NULL,
    "sortorder" INTEGER NOT NULL DEFAULT 0,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "fuenfs_checklisten_punkt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuenfs_audit" (
    "id" TEXT NOT NULL,
    "bereich_id" TEXT NOT NULL,
    "monat" TEXT NOT NULL,
    "status" "FuenfSAuditStatus" NOT NULL DEFAULT 'entwurf',
    "bemerkung" TEXT,
    "score_prozent" DOUBLE PRECISION,
    "erstellt_von_id" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abgeschlossen_am" TIMESTAMP(3),

    CONSTRAINT "fuenfs_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuenfs_audit_position" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "kategorie" "FuenfSKategorie" NOT NULL,
    "text" TEXT NOT NULL,
    "sortorder" INTEGER NOT NULL DEFAULT 0,
    "punkte" INTEGER,
    "nicht_anwendbar" BOOLEAN NOT NULL DEFAULT false,
    "bemerkung" TEXT,
    "abweichung_id" TEXT,

    CONSTRAINT "fuenfs_audit_position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuenfs_bereich_name_key" ON "fuenfs_bereich"("name");

-- CreateIndex
CREATE INDEX "fuenfs_audit_monat_idx" ON "fuenfs_audit"("monat");

-- CreateIndex
CREATE UNIQUE INDEX "fuenfs_audit_bereich_id_monat_key" ON "fuenfs_audit"("bereich_id", "monat");

-- CreateIndex
CREATE INDEX "fuenfs_audit_position_audit_id_idx" ON "fuenfs_audit_position"("audit_id");

-- CreateIndex
CREATE INDEX "datei_fuenfs_position_id_idx" ON "datei"("fuenfs_position_id");

-- CreateIndex
CREATE INDEX "datei_fuenfs_bereich_id_idx" ON "datei"("fuenfs_bereich_id");

-- AddForeignKey
ALTER TABLE "datei" ADD CONSTRAINT "datei_fuenfs_position_id_fkey" FOREIGN KEY ("fuenfs_position_id") REFERENCES "fuenfs_audit_position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datei" ADD CONSTRAINT "datei_fuenfs_bereich_id_fkey" FOREIGN KEY ("fuenfs_bereich_id") REFERENCES "fuenfs_bereich"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuenfs_bereich" ADD CONSTRAINT "fuenfs_bereich_verantwortlich_id_fkey" FOREIGN KEY ("verantwortlich_id") REFERENCES "mitarbeiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuenfs_audit" ADD CONSTRAINT "fuenfs_audit_bereich_id_fkey" FOREIGN KEY ("bereich_id") REFERENCES "fuenfs_bereich"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuenfs_audit" ADD CONSTRAINT "fuenfs_audit_erstellt_von_id_fkey" FOREIGN KEY ("erstellt_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuenfs_audit_position" ADD CONSTRAINT "fuenfs_audit_position_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "fuenfs_audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuenfs_audit_position" ADD CONSTRAINT "fuenfs_audit_position_abweichung_id_fkey" FOREIGN KEY ("abweichung_id") REFERENCES "abweichung"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Genau-ein-Bezug-Invariante (Prisma kann keine Check-Constraints):
-- jede Datei gehört zu GENAU einem von Auftrag / 5S-Position / 5S-Bereich
ALTER TABLE "datei" ADD CONSTRAINT "datei_genau_ein_bezug" CHECK (
  (("auftrag_id" IS NOT NULL)::int + ("fuenfs_position_id" IS NOT NULL)::int + ("fuenfs_bereich_id" IS NOT NULL)::int) = 1
);

-- Seed: Standard-Checkliste (3 Punkte je S, pflegbar/deaktivierbar)
INSERT INTO "fuenfs_checklisten_punkt" ("id", "kategorie", "text", "sortorder") VALUES
(gen_random_uuid(), 'seiri', 'Nur benötigte Werkzeuge/Materialien am Arbeitsplatz', 10),
(gen_random_uuid(), 'seiri', 'Keine defekten oder unbenutzten Gegenstände im Bereich', 20),
(gen_random_uuid(), 'seiri', 'Rote-Punkt-Artikel entfernt oder entschieden', 30),
(gen_random_uuid(), 'seiton', 'Jedes Werkzeug hat einen gekennzeichneten festen Platz', 40),
(gen_random_uuid(), 'seiton', 'Lagerplätze beschriftet und eingehalten', 50),
(gen_random_uuid(), 'seiton', 'Verkehrswege/Stellflächen markiert und frei', 60),
(gen_random_uuid(), 'seiso', 'Arbeitsplatz und Maschinen sauber', 70),
(gen_random_uuid(), 'seiso', 'Keine Leckagen/Späne/Verschmutzungen', 80),
(gen_random_uuid(), 'seiso', 'Reinigungsmittel vorhanden und einsatzbereit', 90),
(gen_random_uuid(), 'seiketsu', 'Soll-Zustand-Fotos aktuell und sichtbar', 100),
(gen_random_uuid(), 'seiketsu', 'Standards/Checklisten am Bereich verfügbar', 110),
(gen_random_uuid(), 'seiketsu', 'Kennzeichnungen einheitlich und lesbar', 120),
(gen_random_uuid(), 'shitsuke', 'Maßnahmen aus dem letzten Audit umgesetzt', 130),
(gen_random_uuid(), 'shitsuke', 'Team kennt und lebt die 5S-Regeln', 140),
(gen_random_uuid(), 'shitsuke', 'Abweichungen werden eigenständig gemeldet', 150);
