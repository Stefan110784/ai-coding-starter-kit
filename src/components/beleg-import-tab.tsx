"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileScan, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ImportErgebnis {
  quelle: string;
  geprueft: number;
  angelegt: number;
  aktualisiert: number;
  uebersprungen: number;
  fehler: Array<{ datei: string; fehler: string }>;
  fehlerText?: string;
}

/** Beleg-Import in der Verwaltung: Verzeichnis-Scan + manueller PDF-Upload (V2: P6). */
export function BelegImportTab() {
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  async function importLauf() {
    setLaeuft(true);
    setErgebnis(null);
    const res = await fetch("/api/import/belege", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok) { toast.error(body.error ?? "Import fehlgeschlagen"); return; }
    setErgebnis(body);
    if (body.fehlerText) {
      toast.error(body.fehlerText);
    } else {
      toast.success(`Import abgeschlossen: ${body.angelegt} angelegt, ${body.aktualisiert} aktualisiert`);
    }
  }

  async function hochladen(file: File) {
    setLaeuft(true);
    const form = new FormData();
    form.append("datei", file);
    const res = await fetch("/api/import/belege/upload", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok) { toast.error(body.error ?? "Upload fehlgeschlagen"); return; }
    toast.success(
      `${body.abNummer} ${body.status === "angelegt" ? "angelegt" : "aktualisiert"} (${body.positionen} Positionen)`
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AB-Belege importieren</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Durchsucht das Belege-Verzeichnis nach AB-PDFs (Dateiname mit AB-Nummer)
            und legt daraus Aufträge an bzw. aktualisiert sie. Bereits verarbeitete,
            unveränderte Dateien werden übersprungen.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={importLauf} disabled={laeuft}>
              {laeuft ? <Loader2 className="size-4 mr-2 animate-spin" /> : <FileScan className="size-4 mr-2" />}
              Verzeichnis scannen
            </Button>
            <input
              ref={uploadInput}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) hochladen(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => uploadInput.current?.click()} disabled={laeuft}>
              <FileUp className="size-4 mr-2" /> Einzelne PDF hochladen
            </Button>
          </div>
        </CardContent>
      </Card>

      {ergebnis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ergebnis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Quelle: {ergebnis.quelle}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Geprüft", ergebnis.geprueft],
                ["Angelegt", ergebnis.angelegt],
                ["Aktualisiert", ergebnis.aktualisiert],
                ["Übersprungen", ergebnis.uebersprungen],
              ].map(([label, wert]) => (
                <div key={label} className="rounded border p-3 text-center">
                  <div className="text-2xl font-bold">{wert}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {ergebnis.fehler.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datei</TableHead>
                    <TableHead>Fehler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ergebnis.fehler.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{f.datei}</TableCell>
                      <TableCell className="text-xs text-destructive">{f.fehler}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
