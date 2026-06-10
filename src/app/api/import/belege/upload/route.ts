import { NextRequest } from "next/server";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { parseBeleg } from "@/lib/beleg-parser";
import { verarbeiteBeleg, basissystemFlags } from "@/lib/beleg-import";

export const maxDuration = 120;

/**
 * Manueller Einzel-Upload einer AB-PDF — Fallback, wenn das Belege-Verzeichnis
 * nicht erreichbar/gemountet ist. Gleiche Verarbeitung wie der Scan-Import,
 * aber ohne Duplikat-Tracking über importierter_beleg.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "verwaltung");
  if ("status" in auth) return auth;

  const form = await req.formData().catch(() => null);
  if (!form) return err("Multipart-Formular erwartet");
  const file = form.get("datei");
  if (!(file instanceof File)) return err("Feld 'datei' erforderlich");
  if (!file.name.toLowerCase().endsWith(".pdf")) return err("Nur PDF-Dateien", 415);

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const daten = await parseBeleg(new Uint8Array(bytes), file.name);
    const flags = await basissystemFlags();
    const status = await verarbeiteBeleg(daten, file.name, bytes, flags);
    return ok({
      status,
      abNummer: daten.abNummer.toUpperCase(),
      positionen: daten.positionen.length,
      kunde: daten.kunde,
      liefertermin: daten.liefertermin,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Beleg konnte nicht verarbeitet werden", 422);
  }
}
