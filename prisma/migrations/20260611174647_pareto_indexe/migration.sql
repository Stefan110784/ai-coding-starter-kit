-- CreateIndex
CREATE INDEX "abweichung_typ_erfasst_am_idx" ON "abweichung"("typ", "erfasst_am");

-- CreateIndex
CREATE INDEX "bestell_position_auftrag_id_idx" ON "bestell_position"("auftrag_id");

