/**
 * Server-Start-Hook (Next.js Instrumentation): automatischer Beleg-Import
 * alle IMPORT_INTERVAL Sekunden — Port des V2-Hintergrund-Loops
 * (backend/app/main.py: _auto_import_loop, Default stündlich, 0 = aus).
 *
 * Wie in V2 läuft der erste Import erst NACH dem ersten Intervall;
 * ein manueller Lauf ist jederzeit über die Verwaltung möglich.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { IMPORT_INTERVAL } = await import("@/lib/config");
  if (IMPORT_INTERVAL <= 0) return;

  // Schutz gegen Mehrfach-Registrierung (Dev-HMR)
  const g = globalThis as typeof globalThis & {
    __belegImportTimer?: ReturnType<typeof setInterval>;
  };
  if (g.__belegImportTimer) return;

  console.log(`[beleg-import-auto] aktiv, Intervall ${IMPORT_INTERVAL}s`);
  g.__belegImportTimer = setInterval(async () => {
    try {
      const { importiereBelege } = await import("@/lib/beleg-import");
      const e = await importiereBelege();
      if (e.fehlerText) {
        console.log(`[beleg-import-auto] ${e.fehlerText} (Quelle: ${e.quelle})`);
      } else {
        console.log(
          `[beleg-import-auto] quelle=${e.quelle} geprueft=${e.geprueft} ` +
            `angelegt=${e.angelegt} aktualisiert=${e.aktualisiert} ` +
            `uebersprungen=${e.uebersprungen} fehler=${e.fehler.length}`
        );
      }
    } catch (err) {
      console.error("[beleg-import-auto] Lauf fehlgeschlagen:", err);
    }
  }, IMPORT_INTERVAL * 1000);
}
