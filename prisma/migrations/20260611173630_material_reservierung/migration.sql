-- CreateTable
CREATE TABLE "material_reservierung" (
    "id" TEXT NOT NULL,
    "auftrag_id" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "menge" DOUBLE PRECISION NOT NULL,
    "typ" TEXT NOT NULL,
    "erstellt_am" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_reservierung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_reservierung_artikelnummer_idx" ON "material_reservierung"("artikelnummer");

-- CreateIndex
CREATE UNIQUE INDEX "material_reservierung_auftrag_id_artikelnummer_key" ON "material_reservierung"("auftrag_id", "artikelnummer");

-- AddForeignKey
ALTER TABLE "material_reservierung" ADD CONSTRAINT "material_reservierung_auftrag_id_fkey" FOREIGN KEY ("auftrag_id") REFERENCES "auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_reservierung" ADD CONSTRAINT "material_reservierung_artikelnummer_fkey" FOREIGN KEY ("artikelnummer") REFERENCES "artikel"("artikelnummer") ON DELETE RESTRICT ON UPDATE CASCADE;

