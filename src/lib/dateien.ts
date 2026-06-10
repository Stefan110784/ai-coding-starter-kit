/** Gemeinsame Logik für Anhänge und Fotos (V2: api/dateien.py). */
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { err, ok } from "@/lib/api-helpers";
import * as storage from "@/lib/storage";

export const MAX_DATEI_BYTES = 25 * 1024 * 1024; // 25 MB

const MIME_WHITELIST = [
  /^application\/pdf$/,
  /^image\//,
  /^text\/plain$/,
  /^text\/csv$/,
  /^application\/zip$/,
  /^application\/vnd\.(ms-excel|ms-word|openxmlformats-officedocument\..+)$/,
  /^application\/msword$/,
];

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function rateMimetype(name: string, typ: string | undefined): string {
  // Serverseitig aus der Dateiendung ableiten (Client-MIME ist fälschbar);
  // nur bei unbekannter Endung den gemeldeten Typ als Fallback verwenden (S-8).
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? typ ?? "application/octet-stream";
}

/** Upload-Handler für Anhänge und Fotos; gibt die Datei-Row oder eine Fehler-Response zurück. */
export async function legeDateiAn(
  auftragId: string,
  file: File,
  opts: { foto: boolean }
): Promise<NextResponse> {
  const auftrag = await prisma.auftrag.findUnique({ where: { id: auftragId } });
  if (!auftrag) return err("Auftrag nicht gefunden", 404);

  if (file.size > MAX_DATEI_BYTES) {
    return err(`Datei zu groß (max. ${MAX_DATEI_BYTES / 1024 / 1024} MB)`, 413);
  }
  const name = file.name || "datei";
  const mimetype = rateMimetype(name, file.type || undefined);
  if (!MIME_WHITELIST.some((rx) => rx.test(mimetype))) {
    return err(`Dateityp ${mimetype} ist nicht erlaubt`, 415);
  }

  const daten = Buffer.from(await file.arrayBuffer());
  const dateiId = randomUUID();
  const rel = storage.relPfad(auftragId, dateiId, name, { foto: opts.foto });
  const size = await storage.schreibe(rel, daten);

  const datei = await prisma.datei.create({
    data: {
      id: dateiId,
      auftragId,
      name,
      size,
      mimetype,
      quelle: opts.foto ? "foto" : "upload",
      speicherpfad: rel,
    },
  });

  if (opts.foto) {
    try {
      await storage.exportiereFoto(auftrag.nummer, dateiId, name, daten);
    } catch (e) {
      console.error(`[foto-export] ${auftrag.nummer}:`, e);
    }
  }

  return ok(datei, 201);
}

/** Download mit Inline-Disposition; 410 wenn der Inhalt in der Ablage fehlt. */
export async function dateiDownloadResponse(dateiId: string): Promise<NextResponse> {
  const datei = await prisma.datei.findUnique({ where: { id: dateiId } });
  if (!datei) return err("Datei nicht gefunden", 404);

  let inhalt: Buffer;
  try {
    inhalt = await storage.lese(datei.speicherpfad);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return err("Datei-Inhalt fehlt in der Ablage", 410);
    }
    throw e;
  }

  // Nur risikoarme Typen inline anzeigen; alles andere (z. B. HTML/SVG) als
  // Download ausliefern, um Inline-Skriptausführung im Origin zu verhindern (S-8).
  const inlineErlaubt = /^(application\/pdf|image\/(png|jpe?g|gif|webp|heic))$/.test(
    datei.mimetype || ""
  );
  const disposition = inlineErlaubt ? "inline" : "attachment";

  return new NextResponse(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": datei.mimetype || "application/octet-stream",
      "Content-Length": String(inhalt.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(datei.name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Erst Ablage-Inhalt, dann DB-Row löschen. */
export async function loescheDatei(dateiId: string): Promise<NextResponse> {
  const datei = await prisma.datei.findUnique({ where: { id: dateiId } });
  if (!datei) return err("Datei nicht gefunden", 404);
  await storage.loesche(datei.speicherpfad);
  await prisma.datei.delete({ where: { id: dateiId } });
  return ok({ ok: true });
}
