-- Materialbewertung (KLR I, Lektion 3): wertmäßige Erfassung an Materialbewegungen.
-- Additiv und nicht-destruktiv — nur neue NULLABLE Spalten (idempotent via IF NOT EXISTS).
ALTER TABLE "materialbewegung" ADD COLUMN IF NOT EXISTS "einstandspreis" numeric(10,4);
ALTER TABLE "materialbewegung" ADD COLUMN IF NOT EXISTS "kostenstelle" text;
ALTER TABLE "materialbewegung" ADD COLUMN IF NOT EXISTS "kostentraeger" text;
