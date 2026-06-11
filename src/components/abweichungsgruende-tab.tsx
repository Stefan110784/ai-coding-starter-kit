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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const API = "/api/abweichungen/gruende";

interface Grund {
  id: string;
  name: string;
  bereich: string;
  aktiv: boolean;
}

const BEREICHE = [
  { value: "nacharbeit", label: "Nacharbeit" },
  { value: "fehlteil", label: "Fehlteil" },
  { value: "wareneingang", label: "Wareneingang" },
  { value: "fuenfs", label: "5S" },
];

const bereichLabel = (b: string) => BEREICHE.find((x) => x.value === b)?.label ?? b;

/**
 * Grund-Katalog für Abweichungen pflegen (KF3-34) — Basis der Pareto-
 * Auswertung. Kein Löschen: Gründe hängen an ISO-Aufzeichnungen,
 * deaktivieren genügt.
 */
export function AbweichungsGruendeTab() {
  const { data, isLoading } = useSWR<Grund[]>(`${API}?alle=1`, fetcher);
  const [dialog, setDialog] = useState<"neu" | Grund | null>(null);
  const [name, setName] = useState("");
  const [bereich, setBereich] = useState("nacharbeit");
  const [laeuft, setLaeuft] = useState(false);

  const gruende = Array.isArray(data) ? data : [];

  function oeffne(ziel: "neu" | Grund) {
    setDialog(ziel);
    setName(ziel === "neu" ? "" : ziel.name);
    setBereich(ziel === "neu" ? "nacharbeit" : ziel.bereich);
  }

  async function speichern() {
    setLaeuft(true);
    try {
      const res = await fetch(dialog === "neu" ? API : `${API}/${(dialog as Grund).id}`, {
        method: dialog === "neu" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), bereich }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Speichern fehlgeschlagen");
        return;
      }
      toast.success(`Grund „${body.name}“ gespeichert`);
      setDialog(null);
      mutate(`${API}?alle=1`);
      mutate((key) => typeof key === "string" && key.startsWith(API));
    } finally {
      setLaeuft(false);
    }
  }

  async function setzeAktiv(g: Grund, aktiv: boolean) {
    const res = await fetch(`${API}/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aktiv }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Änderung fehlgeschlagen");
      return;
    }
    toast.success(`„${g.name}“ ${aktiv ? "aktiviert" : "deaktiviert"}`);
    mutate(`${API}?alle=1`);
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Gründe speisen die Pareto-Auswertung — deaktivieren statt löschen (ISO-Aufzeichnungen).
        </p>
        <Button size="sm" onClick={() => oeffne("neu")}>
          <Plus className="size-4 mr-1" /> Grund anlegen
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Bereich</TableHead>
                <TableHead>Aktiv</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {gruende.map((g) => (
                <TableRow key={g.id} className={g.aktiv ? "" : "opacity-50"}>
                  <TableCell>{g.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{bereichLabel(g.bereich)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={g.aktiv}
                      onCheckedChange={(c) => setzeAktiv(g, c)}
                      aria-label={`${g.name} aktiv`}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => oeffne(g)} aria-label="Bearbeiten">
                      <Pencil className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {gruende.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    Noch keine Gründe — über „Grund anlegen“ den Katalog aufbauen (z. B. Maßfehler, Transportschaden).
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
            <DialogTitle>{dialog === "neu" ? "Grund anlegen" : "Grund bearbeiten"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Maßfehler" />
            </div>
            <div className="space-y-1.5">
              <Label>Bereich</Label>
              <Select value={bereich} onValueChange={setBereich}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BEREICHE.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
