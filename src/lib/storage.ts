/**
 * Dateiablage (Port von V2 services/storage.py): Inhalte liegen im Dateisystem,
 * die DB hält nur die Referenz. Layout:
 *   <STORAGE_DIR>/<auftragId>/<dateiId>_<sichererName>
 *   <STORAGE_DIR>/fotos/<auftragId>/<dateiId>_<sichererName>
 * Der gespeicherte `speicherpfad` ist relativ zu STORAGE_DIR.
 */
import { promises as fs } from "fs";
import path from "path";
import { STORAGE_DIR, FOTO_EXPORT_DIR } from "@/lib/config";

const UNSICHER = /[^A-Za-z0-9._-]+/g;

export function sichererName(name: string | null | undefined): string {
  // Nur Basisname, kein Pfad (auch Windows-Separatoren abschneiden)
  let n = (name || "datei").split(/[/\\]/).pop() || "datei";
  n = n.replace(UNSICHER, "_").replace(/^[._]+|[._]+$/g, "") || "datei";
  return n.slice(0, 120);
}

function absolutPfad(rel: string): string {
  const wurzel = path.resolve(STORAGE_DIR);
  const ziel = path.resolve(wurzel, rel);
  if (ziel !== wurzel && !ziel.startsWith(wurzel + path.sep)) {
    throw new Error("Ungültiger Speicherpfad");
  }
  return ziel;
}

export function relPfad(
  auftragId: string,
  dateiId: string,
  name: string,
  opts?: { foto?: boolean }
): string {
  const teile = opts?.foto ? ["fotos"] : [];
  teile.push(auftragId, `${dateiId}_${sichererName(name)}`);
  return teile.join("/");
}

export async function schreibe(rel: string, daten: Buffer): Promise<number> {
  const ziel = absolutPfad(rel);
  await fs.mkdir(path.dirname(ziel), { recursive: true });
  await fs.writeFile(ziel, daten);
  return daten.length;
}

/** Wirft ENOENT durch, wenn der Inhalt fehlt (→ 410 in der Route). */
export async function lese(rel: string): Promise<Buffer> {
  return fs.readFile(absolutPfad(rel));
}

export async function loesche(rel: string): Promise<void> {
  try {
    await fs.unlink(absolutPfad(rel));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

/** Spiegelt ein Foto nach FOTO_EXPORT_DIR/<auftragNummer>/ — best-effort. */
export async function exportiereFoto(
  auftragNummer: string,
  dateiId: string,
  name: string,
  daten: Buffer
): Promise<void> {
  if (!FOTO_EXPORT_DIR) return;
  const zielDir = path.join(FOTO_EXPORT_DIR, auftragNummer);
  await fs.mkdir(zielDir, { recursive: true });
  await fs.writeFile(path.join(zielDir, `${dateiId}_${sichererName(name)}`), daten);
}
