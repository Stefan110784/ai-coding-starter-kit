import type { ZodError } from "zod";

/**
 * Wandelt einen ZodError in eine `{ feldname: meldung }`-Map (erste Meldung je
 * Feld) für die Inline-Anzeige unter Formularfeldern. Ergänzt die toast-basierten
 * Fehler um feldbezogene Validierung in bestehenden useState-Formularen.
 */
export function feldFehler(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}
