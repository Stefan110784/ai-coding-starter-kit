-- CreateEnum
CREATE TYPE "KundenauftragStatus" AS ENUM ('neu', 'freigegeben', 'geliefert', 'storniert');

-- AlterTable
ALTER TABLE "auftrag" ADD COLUMN     "kundenauftrag_id" TEXT;

-- CreateTable
CREATE TABLE "kunde" (
    "id" TEXT NOT NULL,
    "nr" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "notiz" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "cas_guid" TEXT,
    "quelle" TEXT NOT NULL DEFAULT 'manuell',
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kunde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kundenauftrag" (
    "id" TEXT NOT NULL,
    "nr" SERIAL NOT NULL,
    "kunde_id" TEXT NOT NULL,
    "status" "KundenauftragStatus" NOT NULL DEFAULT 'neu',
    "bezeichnung" TEXT,
    "bestell_nr_kunde" TEXT,
    "wunschtermin" TIMESTAMP(3),
    "bestaetigt_termin" TIMESTAMP(3),
    "geliefert_am" TIMESTAMP(3),
    "cas_guid" TEXT,
    "quelle" TEXT NOT NULL DEFAULT 'manuell',
    "notiz" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstellt_von_id" TEXT,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kundenauftrag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kunde_nr_key" ON "kunde"("nr");

-- CreateIndex
CREATE UNIQUE INDEX "kunde_cas_guid_key" ON "kunde"("cas_guid");

-- CreateIndex
CREATE INDEX "kunde_name_idx" ON "kunde"("name");

-- CreateIndex
CREATE UNIQUE INDEX "kundenauftrag_nr_key" ON "kundenauftrag"("nr");

-- CreateIndex
CREATE UNIQUE INDEX "kundenauftrag_cas_guid_key" ON "kundenauftrag"("cas_guid");

-- CreateIndex
CREATE INDEX "kundenauftrag_status_idx" ON "kundenauftrag"("status");

-- CreateIndex
CREATE INDEX "kundenauftrag_kunde_id_idx" ON "kundenauftrag"("kunde_id");

-- CreateIndex
CREATE INDEX "auftrag_kundenauftrag_id_idx" ON "auftrag"("kundenauftrag_id");

-- AddForeignKey
ALTER TABLE "kundenauftrag" ADD CONSTRAINT "kundenauftrag_kunde_id_fkey" FOREIGN KEY ("kunde_id") REFERENCES "kunde"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kundenauftrag" ADD CONSTRAINT "kundenauftrag_erstellt_von_id_fkey" FOREIGN KEY ("erstellt_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auftrag" ADD CONSTRAINT "auftrag_kundenauftrag_id_fkey" FOREIGN KEY ("kundenauftrag_id") REFERENCES "kundenauftrag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

