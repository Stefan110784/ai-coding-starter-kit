-- CreateTable
CREATE TABLE "auftrag_material_snapshot" (
    "id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "bezeichnung" TEXT,
    "einheit" TEXT,
    "bruttobedarf" DOUBLE PRECISION NOT NULL,
    "bestand" DOUBLE PRECISION NOT NULL,
    "nettobedarf" DOUBLE PRECISION NOT NULL,
    "aus_lager" DOUBLE PRECISION NOT NULL,
    "typ" TEXT NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auftrag_material_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auftrag_material_snapshot_auftrag_id_artikelnummer_key" ON "auftrag_material_snapshot"("auftrag_id", "artikelnummer");

-- AddForeignKey
ALTER TABLE "auftrag_material_snapshot" ADD CONSTRAINT "auftrag_material_snapshot_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

