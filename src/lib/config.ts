/** Server-seitige Konfiguration (V2: app/config.py). */

/** Abpackzeit in Minuten pro Stück für Lagerentnahmen (Soll-Zeit-Berechnung). */
export const ABPACKZEIT_MINUTEN = Number(process.env.ABPACKZEIT_MINUTEN ?? "2");

/** Wurzelverzeichnis der Dateiablage (Anhänge, Fotos, Beleg-PDFs). */
export const STORAGE_DIR = process.env.STORAGE_DIR ?? "./data/files";

/** Quellverzeichnis für den AB-Beleg-Import; unterstützt {jahr}-Platzhalter. */
export const BELEGE_DIR = process.env.BELEGE_DIR ?? "./data/belege";

/** Intervall des automatischen Beleg-Imports in Sekunden; 0 = aus (V2: import_interval). */
export const IMPORT_INTERVAL = Number(process.env.IMPORT_INTERVAL ?? "3600");

/** Optionaler Spiegel-Export für Fotos (z. B. Netzlaufwerk); leer = deaktiviert. */
export const FOTO_EXPORT_DIR = process.env.FOTO_EXPORT_DIR ?? "";
