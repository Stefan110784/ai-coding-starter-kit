-- AlterTable
ALTER TABLE "auftrag" ADD COLUMN     "erstellt_von_id" TEXT;

-- AlterTable
ALTER TABLE "datei" ADD COLUMN     "hochgeladen_von_id" TEXT;

-- AlterTable
ALTER TABLE "qualitaet" ADD COLUMN     "erfasst_von_id" TEXT;

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "entitaet" TEXT NOT NULL,
    "entitaet_id" TEXT NOT NULL,
    "aktion" TEXT NOT NULL,
    "feld" TEXT,
    "alt_wert" TEXT,
    "neu_wert" TEXT,
    "kontext" JSONB,
    "benutzer_id" TEXT,
    "zeitstempel" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_event_entitaet_entitaet_id_idx" ON "audit_event"("entitaet", "entitaet_id");

-- CreateIndex
CREATE INDEX "audit_event_zeitstempel_idx" ON "audit_event"("zeitstempel");

-- AddForeignKey
ALTER TABLE "auftrag" ADD CONSTRAINT "auftrag_erstellt_von_id_fkey" FOREIGN KEY ("erstellt_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualitaet" ADD CONSTRAINT "qualitaet_erfasst_von_id_fkey" FOREIGN KEY ("erfasst_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datei" ADD CONSTRAINT "datei_hochgeladen_von_id_fkey" FOREIGN KEY ("hochgeladen_von_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_benutzer_id_fkey" FOREIGN KEY ("benutzer_id") REFERENCES "benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

