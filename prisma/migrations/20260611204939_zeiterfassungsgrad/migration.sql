-- AlterTable
ALTER TABLE "mitarbeiter" ADD COLUMN     "wochenstunden" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "zeitkategorie" ADD COLUMN     "auftragsbezogen" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "zeit_soll_monat" (
    "id" TEXT NOT NULL,
    "monat" TEXT NOT NULL,
    "soll_stunden" DOUBLE PRECISION NOT NULL,
    "bemerkung" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendert_am" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zeit_soll_monat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zeit_soll_monat_monat_key" ON "zeit_soll_monat"("monat");

