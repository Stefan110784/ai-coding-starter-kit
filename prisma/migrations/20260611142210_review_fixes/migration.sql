-- DropForeignKey
ALTER TABLE "pruefung" DROP CONSTRAINT "pruefung_pruefer_id_fkey";

-- AlterTable
ALTER TABLE "abweichung" ADD COLUMN     "auftrag_nummer" TEXT;

-- AlterTable
ALTER TABLE "pruefung" ADD COLUMN     "auftrag_nummer" TEXT,
ALTER COLUMN "pruefer_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "pruefung" ADD CONSTRAINT "pruefung_pruefer_id_fkey" FOREIGN KEY ("pruefer_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

