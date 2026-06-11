"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface MangelPosition {
  artikelnummer: string;
  bezeichnung?: string | null;
  einheit?: string | null;
  bruttobedarf: number;
  bestand: number;
  nettobedarf: number;
}

/**
 * Dialog zum Abschluss der Kommissionierung: Lagerort wählen, Statuswechsel
 * auf "kommissioniert" auslösen; bei Materialmangel (409) wird die Mangelliste
 * gezeigt und kann mit force=true übersteuert werden (V2-Ablauf).
 */
export function KommissionierDialog({
  auftrag,
  open,
  onOpenChange,
  onDone,
}: {
  auftrag: { id: string; nummer: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const { data: lagerorte } = useSWR(open ? "/api/material/lagerorte" : null, fetcher);
  const [lagerortId, setLagerortId] = useState("");
  const [mangelnd, setMangelnd] = useState<MangelPosition[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  function schliessen(o: boolean) {
    if (!o) setMangelnd(null);
    onOpenChange(o);
  }

  async function kommissionieren(force: boolean) {
    if (!auftrag) return;
    setLaeuft(true);
    const params = new URLSearchParams();
    if (lagerortId) params.set("lagerortId", lagerortId);
    if (force) params.set("force", "true");
    const res = await fetch(`/api/auftraege/${auftrag.id}?${params}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "kommissioniert" }),
    });
    const body = await res.json().catch(() => ({}));
    setLaeuft(false);

    if (res.status === 409 && Array.isArray(body.mangelnd)) {
      setMangelnd(body.mangelnd);
      return;
    }
    if (!res.ok) {
      toast.error(body.error ?? "Kommissionierung fehlgeschlagen");
      return;
    }
    toast.success("Kommissioniert — Entnahmen gebucht");
    schliessen(false);
    onDone?.();
  }

  const orte: Array<{ id: string; name: string }> = Array.isArray(lagerorte) ? lagerorte : [];

  return (
    <Dialog open={open} onOpenChange={schliessen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mangelnd ? "Materialmangel" : `Kommissionierung abschließen — ${auftrag?.nummer ?? ""}`}
          </DialogTitle>
        </DialogHeader>

        {mangelnd ? (
          <div className="space-y-3">
            <p className="text-sm">
              Für folgende Artikel reicht der Bestand nicht aus:
            </p>
            <div className="max-h-60 overflow-y-auto rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-2 font-medium">Artikel</th>
                    <th className="p-2 font-medium text-right">Bedarf</th>
                    <th className="p-2 font-medium text-right">Bestand</th>
                    <th className="p-2 font-medium text-right">Fehlt</th>
                  </tr>
                </thead>
                <tbody>
                  {mangelnd.map((m) => (
                    <tr key={m.artikelnummer} className="border-b last:border-0">
                      <td className="p-2">
                        <div className="font-mono text-xs">{m.artikelnummer}</div>
                        <div className="text-xs text-muted-foreground">{m.bezeichnung}</div>
                      </td>
                      <td className="p-2 text-right font-mono">{m.bruttobedarf}</td>
                      <td className="p-2 text-right font-mono">{m.bestand}</td>
                      <td className="p-2 text-right font-mono text-destructive">{m.nettobedarf}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Trotzdem kommissionieren bucht die Entnahmen und kann negative Bestände erzeugen.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => schliessen(false)}>Abbrechen</Button>
              <Button variant="destructive" disabled={laeuft} onClick={() => kommissionieren(true)}>
                Trotzdem kommissionieren
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Das bucht alle Entnahmen und setzt den Auftrag auf „Kommissioniert“.
            </p>
            <div className="space-y-1.5">
              <Label>Lagerort für die Entnahme</Label>
              <Select value={lagerortId} onValueChange={setLagerortId}>
                <SelectTrigger>
                  <SelectValue placeholder="Erster aktiver Lagerort" />
                </SelectTrigger>
                <SelectContent>
                  {orte.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => schliessen(false)}>Abbrechen</Button>
              <Button disabled={laeuft} onClick={() => kommissionieren(false)}>
                Abschließen
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
