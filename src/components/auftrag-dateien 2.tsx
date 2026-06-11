"use client";

import { useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Camera, FileUp, Trash2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Datei {
  id: string;
  name: string;
  size: number;
  mimetype: string;
  quelle?: string | null;
  hinzugefuegt: string;
}

function fmtGroesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const QUELLE_LABEL: Record<string, string> = {
  upload: "Upload",
  "pdf-beleg": "AB-Beleg",
  foto: "Foto",
};

/** Anhänge + Foto-Galerie im Auftrags-Detail (V2: Dateien-/Foto-Bereich). */
export function AuftragDateien({
  auftragId,
  istAdmin,
}: {
  auftragId: string;
  istAdmin: boolean;
}) {
  const dateienKey = `/api/dateien?auftragId=${auftragId}`;
  const fotosKey = `/api/fotos?auftragId=${auftragId}`;
  const { data: dateien, isLoading } = useSWR(dateienKey, fetcher);
  const { data: fotos } = useSWR(fotosKey, fetcher);
  const dateiInput = useRef<HTMLInputElement>(null);
  const fotoInput = useRef<HTMLInputElement>(null);
  const [loeschen, setLoeschen] = useState<{ id: string; foto: boolean; name: string } | null>(null);

  async function hochladen(file: File, foto: boolean) {
    const form = new FormData();
    form.append("datei", file);
    const res = await fetch(`/api/${foto ? "fotos" : "dateien"}?auftragId=${auftragId}`, {
      method: "POST",
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Upload fehlgeschlagen"); return; }
    toast.success(`${foto ? "Foto" : "Datei"} hochgeladen`);
    mutate(foto ? fotosKey : dateienKey);
  }

  async function bestaetigeLoeschen() {
    if (!loeschen) return;
    const res = await fetch(`/api/${loeschen.foto ? "fotos" : "dateien"}/${loeschen.id}`, {
      method: "DELETE",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Löschen fehlgeschlagen"); return; }
    toast.success("Gelöscht");
    mutate(loeschen.foto ? fotosKey : dateienKey);
    setLoeschen(null);
  }

  const anhangListe: Datei[] = Array.isArray(dateien) ? dateien : [];
  const fotoListe: Datei[] = Array.isArray(fotos) ? fotos : [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Anhänge ─────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Anhänge ({anhangListe.length})</h3>
          {istAdmin && (
            <>
              <input
                ref={dateiInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) hochladen(f, false);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="outline" onClick={() => dateiInput.current?.click()}>
                <FileUp className="size-3 mr-1" /> Hochladen
              </Button>
            </>
          )}
        </div>
        {anhangListe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Anhänge</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Quelle</TableHead>
                <TableHead className="text-right">Größe</TableHead>
                <TableHead>Datum</TableHead>
                {istAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {anhangListe.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <a
                      href={`/api/dateien/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-sm hover:underline"
                    >
                      <FileText className="size-3 shrink-0 text-muted-foreground" />
                      {d.name}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.quelle === "pdf-beleg" ? "secondary" : "outline"} className="text-[10px]">
                      {QUELLE_LABEL[d.quelle ?? ""] ?? d.quelle ?? "–"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs">{fmtGroesse(d.size)}</TableCell>
                  <TableCell className="text-xs">
                    {new Date(d.hinzugefuegt).toLocaleDateString("de-DE")}
                  </TableCell>
                  {istAdmin && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-destructive"
                        onClick={() => setLoeschen({ id: d.id, foto: false, name: d.name })}
                        aria-label="Datei löschen"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ── Fotos ───────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Fotos ({fotoListe.length})</h3>
          <input
            ref={fotoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) hochladen(f, true);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fotoInput.current?.click()}>
            <Camera className="size-3 mr-1" /> Foto hinzufügen
          </Button>
        </div>
        {fotoListe.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Fotos</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotoListe.map((f) => (
              <div key={f.id} className="group relative">
                <a href={`/api/fotos/${f.id}`} target="_blank" rel="noreferrer">
                  {/* Galerie-Thumbnails laden direkt aus der Download-Route */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/fotos/${f.id}`}
                    alt={f.name}
                    className="aspect-square w-full rounded border object-cover"
                  />
                </a>
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100"
                  onClick={() => setLoeschen({ id: f.id, foto: true, name: f.name })}
                  aria-label="Foto löschen"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!loeschen}
        onOpenChange={(o) => { if (!o) setLoeschen(null); }}
        title={loeschen?.foto ? "Foto löschen?" : "Datei löschen?"}
        description={`"${loeschen?.name}" wird dauerhaft aus der Ablage entfernt.`}
        confirmLabel="Löschen"
        onConfirm={bestaetigeLoeschen}
      />
    </div>
  );
}
