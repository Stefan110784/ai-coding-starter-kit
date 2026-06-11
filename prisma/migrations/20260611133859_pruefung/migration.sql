-- CreateEnum
CREATE TYPE "PruefTyp" AS ENUM ('endpruefung', 'wareneingang');

-- CreateEnum
CREATE TYPE "PruefErgebnis" AS ENUM ('ok', 'bedingtFrei', 'abweichend');

-- CreateTable
CREATE TABLE "pruefung" (
    "id" TEXT NOT NULL,
    "typ" "PruefTyp" NOT NULL,
    "ergebnis" "PruefErgebnis" NOT NULL,
    "auftrag_id" TEXT,
    "bewegung_id" TEXT,
    "artikelnummer" TEXT,
    "menge" DOUBLE PRECISION,
    "bemerkung" TEXT,
    "pruefer_id" TEXT NOT NULL,
    "geprueft_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pruefung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pruefung_bewegung_id_key" ON "pruefung"("bewegung_id");

-- CreateIndex
CREATE INDEX "pruefung_auftrag_id_idx" ON "pruefung"("auftrag_id");

-- AddForeignKey
ALTER TABLE "pruefung" ADD CONSTRAINT "pruefung_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pruefung" ADD CONSTRAINT "pruefung_bewegung_id_fkey" FOREIGN KEY ("bewegung_id") REFERENCES "materialbewegung"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pruefung" ADD CONSTRAINT "pruefung_pruefer_id_fkey" FOREIGN KEY ("pruefer_id") REFERENCES "benutzer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

