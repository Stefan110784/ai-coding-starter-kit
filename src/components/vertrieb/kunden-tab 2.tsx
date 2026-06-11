"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const API = "/api/kunden";

export interface KundeRow {
  id: string;
  nr: number;
  name: string;
  notiz?: string | null;
  casGuid?: string | null;
  quelle: string;
  aktiv: boolean;
  _count?: { kundenauftraege: number };
}

/** Kundenstamm (KF3-37) — Soft-Delete, casGuid manuell mappbar (CAS-Vorbereitung). */
export function KundenTab() {
  const { hatRecht } = useMe();
  const darfBearbeiten = hatRecht("vertrieb.bearbeiten");
  const { data, isLoading } = useSWR<KundeRow[]>(`${API}?alle=1`, fetcher);

  const [dialog, setDialog] = useState<"neu" | KundeRow | null>(null);
  const [name, setName] = useState("");
  const [notiz, setNotiz] = useState("");
  const [casGuid, setCasGuid] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const kunden = Array.isArray(data) ? data : [];

  function oeffne(ziel: "neu" | KundeRow) {
    setDialog(ziel);
    setName(ziel === "neu" ? "" : ziel.name);
    setNotiz(ziel === "neu" ? "" : ziel.notiz ?? "");
    setCasGuid(ziel === "neu" ? "" : ziel.casGuid ?? "");
  }

  function neuLaden() {
    mutate(`${API}?alle=1`);
    mutate((key) => typeof key === "string" && key.startsWith(API));
  }

  async function speichern() {
    setLaeuft(true);
    try {
      const res = await fetch(dialog === "neu" ? API : `${API}/${(dialog as KundeRow).id}`, {
        method: dialog === "neu" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          notiz: notiz.trim() || null,
          casGuid: casGuid.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Speichern fehlgeschlagen");
        return;
      }
      toast.success(`Kunde K-${body.nr} gespeichert`);
      setDialog(null);
      neuLaden();
    } finally {
      setLaeuft(false);
    }
  }

  async function setzeAktiv(k: KundeRow, aktiv: boolean) {
    const res = await fetch(`${API}/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aktiv }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Änderung fehlgeschlagen");
      return;
    }
    toast.success(`${k.name} ${aktiv ? "aktiviert" : "deaktiviert"}`);
    neuLaden();
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          CAS genesisWorld wird später führend — Kontakte/Adressen bleiben dort, hier zählt die Identität.
        </p>
        {darfBearbeiten && (
          <Button size="sm" onClick={() => oeffne("neu")}>
            <Plus className="size-4 mr-1" /> Kunde anlegen
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nr.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Kundenaufträge</TableHead>
                <TableHead>CAS</TableHead>
                <TableHead>Aktiv</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {kunden.map((k) => (
                <TableRow key={k.id} className={k.aktiv ? "" : "opacity-50"}>
                  <TableCell className="font-mono">K-{k.nr}</TableCell>
                  <TableCell>
                    {k.name}
                    {k.notiz && <div className="text-xs text-muted-foreground">{k.notiz}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{k._count?.kundenauftraege ?? 0}</TableCell>
                  <TableCell>
                    {k.casGuid ? (
                      <Badge variant="outline" className="text-[10px]" title={k.casGuid}>gemappt</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={k.aktiv}
                      onCheckedChange={(c) => setzeAktiv(k, c)}
                      disabled={!darfBearbeiten}
                      aria-label={`${k.name} aktiv`}
                    />
                  </TableCell>
                  <TableCell>
                    {darfBearbeiten && (
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => oeffne(k)} aria-label="Bearbeiten">
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {kunden.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Noch keine Kunden — über „Kunde anlegen“ oder das Backfill-Skript aus den Bestandsaufträgen.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === "neu" ? "Kunde anlegen" : `Kunde K-${(dialog as KundeRow)?.nr} bearbeiten`}</DialogTitle>
            <DialogDescription>Kein Löschen — Kunden werden deaktiviert (ISO/CAS-Vorgabe).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Firmenname" />
            </div>
            <div className="space-y-1.5">
              <Label>Notiz</Label>
              <Textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CAS-GUID (optional)</Label>
              <Input
                value={casGuid}
                onChange={(e) => setCasGuid(e.target.value)}
                placeholder="GUID aus CAS genesisWorld — Vorab-Mapping für den Sync"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Abbrechen</Button>
            <Button disabled={!name.trim() || laeuft} onClick={speichern}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
