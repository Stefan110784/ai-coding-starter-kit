"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";
import type { KundeRow } from "@/components/vertrieb/kunden-tab";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface KundenauftragRow {
  id: string;
  nr: number;
  status: "neu" | "freigegeben" | "geliefert" | "storniert";
  bezeichnung?: string | null;
  bestellNrKunde?: string | null;
  wunschtermin: string | null;
  bestaetigtTermin: string | null;
  geliefertAm: string | null;
  notiz?: string | null;
  kunde: { id: string; name: string; nr: number };
  auftraege: Array<{ id: string; nummer: string; status: string; bezeichnung?: string }>;
  faGesamt: number;
  faAbgeschlossen: number;
}

const STATUS_LABEL: Record<string, string> = {
  neu: "Neu",
  freigegeben: "Freigegeben",
  geliefert: "Geliefert",
  storniert: "Storniert",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  neu: "secondary",
  freigegeben: "default",
  geliefert: "outline",
  storniert: "destructive",
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("de-DE") : "–";
}

function alsDatum(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function alsIso(datum: string): string | null {
  return datum ? new Date(`${datum}T12:00:00`).toISOString() : null;
}

/** Kundenaufträge (KF3-37): Liste, Status-Führung, FA-Verknüpfung sichtbar. */
export function KundenauftraegeTab() {
  const { hatRecht } = useMe();
  const darfBearbeiten = hatRecht("vertrieb.bearbeiten");

  const [filter, setFilter] = useState<"offen" | "alle">("offen");
  const key = `/api/kundenauftraege?status=${filter}`;
  const { data, isLoading } = useSWR<KundenauftragRow[]>(key, fetcher);
  const { data: kundenData } = useSWR<KundeRow[]>("/api/kunden", fetcher);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [form, setForm] = useState({ kundeId: "", bezeichnung: "", bestellNrKunde: "", wunschtermin: "", notiz: "" });
  const [laeuft, setLaeuft] = useState(false);

  const liste = Array.isArray(data) ? data : [];
  const kunden = Array.isArray(kundenData) ? kundenData : [];
  const detail = liste.find((k) => k.id === detailId) ?? null;

  function neuLaden() {
    mutate(key);
    mutate((k) => typeof k === "string" && k.startsWith("/api/kundenauftraege"));
  }

  async function anlegen() {
    setLaeuft(true);
    try {
      const res = await fetch("/api/kundenauftraege", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kundeId: form.kundeId,
          ...(form.bezeichnung.trim() ? { bezeichnung: form.bezeichnung.trim() } : {}),
          ...(form.bestellNrKunde.trim() ? { bestellNrKunde: form.bestellNrKunde.trim() } : {}),
          ...(form.wunschtermin ? { wunschtermin: alsIso(form.wunschtermin) } : {}),
          ...(form.notiz.trim() ? { notiz: form.notiz.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Anlegen fehlgeschlagen");
        return;
      }
      toast.success(`Kundenauftrag KA-${body.nr} angelegt`);
      setNeuOffen(false);
      setForm({ kundeId: "", bezeichnung: "", bestellNrKunde: "", wunschtermin: "", notiz: "" });
      neuLaden();
    } finally {
      setLaeuft(false);
    }
  }

  async function patch(k: KundenauftragRow, payload: Record<string, unknown>, erfolg: string) {
    const res = await fetch(`/api/kundenauftraege/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Änderung fehlgeschlagen");
      return;
    }
    toast.success(erfolg);
    neuLaden();
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button size="sm" variant={filter === "offen" ? "default" : "outline"} onClick={() => setFilter("offen")}>
            Offene
          </Button>
          <Button size="sm" variant={filter === "alle" ? "default" : "outline"} onClick={() => setFilter("alle")}>
            Alle
          </Button>
        </div>
        {darfBearbeiten && (
          <Button size="sm" onClick={() => setNeuOffen(true)} disabled={kunden.length === 0}>
            <Plus className="size-4 mr-1" /> Kundenauftrag
          </Button>
        )}
      </div>

      {liste.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Keine {filter === "offen" ? "offenen " : ""}Kundenaufträge.
            {kunden.length === 0 && " Zuerst im Tab „Kunden“ einen Kunden anlegen."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr.</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead>Wunschtermin</TableHead>
                  <TableHead className="text-right">Fertigung</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.map((k) => (
                  <TableRow key={k.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(k.id)}>
                    <TableCell className="font-mono font-medium">KA-{k.nr}</TableCell>
                    <TableCell>{k.kunde.name}</TableCell>
                    <TableCell className="max-w-56 truncate text-sm">{k.bezeichnung ?? "–"}</TableCell>
                    <TableCell className="text-sm">{fmt(k.wunschtermin)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {k.faGesamt > 0 ? `${k.faAbgeschlossen}/${k.faGesamt}` : "–"}
                      {k.faGesamt > 0 && k.faAbgeschlossen === k.faGesamt && k.status === "freigegeben" && (
                        <Badge variant="outline" className="ml-2 text-[10px]">fertig</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[k.status]}>{STATUS_LABEL[k.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Detail-Sheet ─────────────────────────────────────── */}
      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {detail && (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle className="flex items-center gap-2 font-mono text-lg">
                  KA-{detail.nr}
                  <span className="font-sans text-sm font-normal text-muted-foreground">{detail.kunde.name}</span>
                  <Badge variant={STATUS_VARIANT[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
                </SheetTitle>
              </SheetHeader>

              {darfBearbeiten && (
                <div className="flex flex-wrap items-end gap-3 py-2">
                  {detail.status === "neu" && (
                    <Button size="sm" onClick={() => patch(detail, { status: "freigegeben" }, `KA-${detail.nr} für die Fertigung freigegeben`)}>
                      Fertigung freigeben
                    </Button>
                  )}
                  {detail.status === "freigegeben" && (
                    <Button size="sm" onClick={() => patch(detail, { status: "geliefert" }, `KA-${detail.nr} als geliefert markiert`)}>
                      Als geliefert markieren
                    </Button>
                  )}
                  {["neu", "freigegeben"].includes(detail.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => patch(detail, { status: "storniert" }, `KA-${detail.nr} storniert`)}
                    >
                      Stornieren
                    </Button>
                  )}
                  {detail.faGesamt > 0 && detail.faAbgeschlossen === detail.faGesamt && detail.status === "freigegeben" && (
                    <Badge variant="outline">alle Fertigungsaufträge abgeschlossen</Badge>
                  )}
                </div>
              )}

              <div className="grid gap-3 py-2 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Wunschtermin</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={alsDatum(detail.wunschtermin)}
                    disabled={!darfBearbeiten}
                    onChange={(e) => patch(detail, { wunschtermin: alsIso(e.target.value) }, "Wunschtermin gespeichert")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bestätigter Termin</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={alsDatum(detail.bestaetigtTermin)}
                    disabled={!darfBearbeiten}
                    onChange={(e) => patch(detail, { bestaetigtTermin: alsIso(e.target.value) }, "Bestätigter Termin gespeichert")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Geliefert am</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={alsDatum(detail.geliefertAm)}
                    disabled={!darfBearbeiten || detail.status !== "geliefert"}
                    onChange={(e) => patch(detail, { geliefertAm: alsIso(e.target.value) }, "Lieferdatum gespeichert")}
                  />
                </div>
              </div>
              {detail.bestellNrKunde && (
                <p className="text-sm text-muted-foreground">Bestell-Nr. Kunde: {detail.bestellNrKunde}</p>
              )}

              <h3 className="pt-3 text-sm font-semibold">Fertigungsaufträge ({detail.faGesamt})</h3>
              {detail.auftraege.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Noch keine verknüpft — die Zuordnung erfolgt im Fertigungsauftrag (Detail → Kundenauftrag).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nummer</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.auftraege.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-sm">{a.nummer}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "abgeschlossen" ? "outline" : "secondary"}>{a.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {detail.notiz && <p className="mt-3 rounded bg-muted p-2 text-xs">{detail.notiz}</p>}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Anlage-Dialog ────────────────────────────────────── */}
      <Dialog open={neuOffen} onOpenChange={setNeuOffen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kundenauftrag anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kunde *</Label>
              <Select value={form.kundeId} onValueChange={(v) => setForm({ ...form, kundeId: v })}>
                <SelectTrigger><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
                <SelectContent>
                  {kunden.filter((k) => k.aktiv).map((k) => (
                    <SelectItem key={k.id} value={k.id}>K-{k.nr} · {k.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bezeichnung</Label>
              <Input value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bestell-Nr. Kunde</Label>
                <Input value={form.bestellNrKunde} onChange={(e) => setForm({ ...form, bestellNrKunde: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Wunschtermin</Label>
                <Input type="date" value={form.wunschtermin} onChange={(e) => setForm({ ...form, wunschtermin: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notiz</Label>
              <Textarea rows={2} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNeuOffen(false)}>Abbrechen</Button>
            <Button disabled={!form.kundeId || laeuft} onClick={anlegen}>Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
