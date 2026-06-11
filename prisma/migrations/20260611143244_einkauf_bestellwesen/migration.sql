-- CreateEnum
CREATE TYPE "Bestellstatus" AS ENUM ('angefragt', 'bestellt', 'teilgeliefert', 'abgeschlossen', 'storniert');

-- AlterTable
ALTER TABLE "materialbewegung" ADD COLUMN     "bestell_position_id" TEXT;

-- CreateTable
CREATE TABLE "bestellung" (
    "id" TEXT NOT NULL,
    "nr" SERIAL NOT NULL,
    "lieferant_id" TEXT NOT NULL,
    "status" "Bestellstatus" NOT NULL DEFAULT 'angefragt',
    "zugesagt_termin" TIMESTAMP(3),
    "bestellt_am" TIMESTAMP(3),
    "abgeschlossen_am" TIMESTAMP(3),
    "bemerkung" TEXT,
    "angelegt_von_id" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bestellung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bestell_position" (
    "id" TEXT NOT NULL,
    "bestellung_id" TEXT NOT NULL,
    "pos_nr" INTEGER NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "menge" DOUBLE PRECISION NOT NULL,
    "preis" DECIMAL(10,4),
    "vorschlagsmenge" DOUBLE PRECISION,
    "uebersteuerungs_grund" TEXT,
    "zugesagt_termin" TIMESTAMP(3),
    "auftrag_id" TEXT,

    CONSTRAINT "bestell_position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bestellung_nr_key" ON "bestellung"("nr");

-- CreateIndex
CREATE INDEX "bestellung_status_idx" ON "bestellung"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bestell_position_bestellung_id_pos_nr_key" ON "bestell_position"("bestellung_id", "pos_nr");

-- CreateIndex
CREATE INDEX "materialbewegung_bestell_position_id_idx" ON "materialbewegung"("bestell_position_id");

-- AddForeignKey
ALTER TABLE "materialbewegung" ADD CONSTRAINT "materialbewegung_bestell_position_id_fkey" FOREIGN KEY ("bestell_position_id") REFERENCES "bestell_position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestellung" ADD CONSTRAINT "bestellung_lieferant_id_fkey" FOREIGN KEY ("lieferant_id") REFERENCES "lieferant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestellung" ADD CONSTRAINT "bestellung_angelegt_von_id_fkey" FOREIGN KEY ("angelegt_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestell_position" ADD CONSTRAINT "bestell_position_bestellung_id_fkey" FOREIGN KEY ("bestellung_id") REFERENCES "bestellung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestell_position" ADD CONSTRAINT "bestell_position_artikelnummer_fkey" FOREIGN KEY ("artikelnummer") REFERENCES "artikel"("artikelnummer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestell_position" ADD CONSTRAINT "bestell_position_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

