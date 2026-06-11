-- CreateTable
CREATE TABLE "artikel_lieferant_preis" (
    "id" TEXT NOT NULL,
    "artikel_lieferant_id" TEXT NOT NULL,
    "preis" DECIMAL(10,4) NOT NULL,
    "gueltig_ab" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quelle" TEXT,
    "benutzer_id" TEXT,

    CONSTRAINT "artikel_lieferant_preis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artikel_lieferant_preis_artikel_lieferant_id_gueltig_ab_idx" ON "artikel_lieferant_preis"("artikel_lieferant_id", "gueltig_ab");

-- AddForeignKey
ALTER TABLE "artikel_lieferant_preis" ADD CONSTRAINT "artikel_lieferant_preis_artikel_lieferant_id_fkey" FOREIGN KEY ("artikel_lieferant_id") REFERENCES "artikel_lieferant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artikel_lieferant_preis" ADD CONSTRAINT "artikel_lieferant_preis_benutzer_id_fkey" FOREIGN KEY ("benutzer_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: je bestehendem Artikel-Lieferant-Link den aktuellen Preis als
-- initiale Historien-Zeile übernehmen (quelle 'manuell', gueltigAb = Anlage).
INSERT INTO "artikel_lieferant_preis" ("id", "artikel_lieferant_id", "preis", "gueltig_ab", "quelle")
SELECT gen_random_uuid(), "id", "einkaufspreis", "erstellt_am", 'manuell' FROM "artikel_lieferant";
