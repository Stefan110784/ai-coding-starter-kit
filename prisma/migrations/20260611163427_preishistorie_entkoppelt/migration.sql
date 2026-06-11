-- DropForeignKey
ALTER TABLE "artikel_lieferant_preis" DROP CONSTRAINT "artikel_lieferant_preis_artikel_lieferant_id_fkey";

-- AlterTable
ALTER TABLE "artikel_lieferant_preis" ADD COLUMN     "artikelnummer" TEXT,
ADD COLUMN     "lieferant_id" TEXT;


-- Backfill: bestehende Historien-Zeilen mit Artikel/Lieferant aus dem Link denormalisieren
UPDATE "artikel_lieferant_preis" p
SET "artikelnummer" = al."artikelnummer", "lieferant_id" = al."lieferant_id"
FROM "artikel_lieferant" al
WHERE al."id" = p."artikel_lieferant_id";
