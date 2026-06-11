-- CreateEnum
CREATE TYPE "AbweichungTyp" AS ENUM ('nacharbeit', 'ausschuss', 'reklamationKunde', 'reklamationLieferant');

-- CreateEnum
CREATE TYPE "AbweichungStatus" AS ENUM ('offen', 'inBearbeitung', 'abgeschlossen');

-- CreateTable
CREATE TABLE "abweichungs_grund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bereich" TEXT NOT NULL DEFAULT 'nacharbeit',
    "aktiv" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "abweichungs_grund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abweichung" (
    "id" TEXT NOT NULL,
    "typ" "AbweichungTyp" NOT NULL,
    "status" "AbweichungStatus" NOT NULL DEFAULT 'offen',
    "auftrag_id" TEXT,
    "artikelnummer" TEXT,
    "beschreibung" TEXT NOT NULL,
    "ursache" TEXT,
    "massnahme" TEXT,
    "grund_id" TEXT,
    "verantwortlich_id" TEXT,
    "faellig_am" TIMESTAMP(3),
    "erfasst_von_id" TEXT,
    "erfasst_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abgeschlossen_am" TIMESTAMP(3),

    CONSTRAINT "abweichung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "abweichungs_grund_name_key" ON "abweichungs_grund"("name");

-- CreateIndex
CREATE INDEX "abweichung_status_idx" ON "abweichung"("status");

-- CreateIndex
CREATE INDEX "abweichung_auftrag_id_idx" ON "abweichung"("auftrag_id");

-- AddForeignKey
ALTER TABLE "abweichung" ADD CONSTRAINT "abweichung_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichung" ADD CONSTRAINT "abweichung_grund_id_fkey" FOREIGN KEY ("grund_id") REFERENCES "abweichungs_grund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichung" ADD CONSTRAINT "abweichung_verantwortlich_id_fkey" FOREIGN KEY ("verantwortlich_id") REFERENCES "mitarbeiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abweichung" ADD CONSTRAINT "abweichung_erfasst_von_id_fkey" FOREIGN KEY ("erfasst_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

