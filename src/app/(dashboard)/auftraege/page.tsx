"use client";

import { useState } from "react";
import { z } from "zod";
import { feldFehler } from "@/lib/form-errors";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, Search, QrCode, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { PrioritaetBadge, PRIORITAET_LABELS } from "@/components/prioritaet-badge";
import { StatusampelPunkt } from "@/components/statusampel-punkt";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { KommissionierDialog } from "@/components/material/kommissionier-dialog";
import { PruefungDialog } from "@/components/pruefung-dialog";
import { MaterialbedarfBlock } from "@/components/material/materialbedarf-block";
import { AuftragDateien } from "@/components/auftrag-dateien";
import { AuftragVerlauf } from "@/components/auftrag-verlauf";
import { AbweichungBlock } from "@/components/abweichung-block";
import { PackmasseEditor } from "@/components/packmasse-editor";
import { AuftragTeam } from "@/components/zuweisung-uebersicht";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  kommissioniert: "Kommissioniert",
  laeuft: "In Bearbeitung",
  pausiert: "Pausiert",
  abgeschlossen: "Abgeschlossen",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  offen: "secondary",
  kommissioniert: "outline",
  laeuft: "default",
  pausiert: "destructive",
  abgeschlossen: "outline",
};

type Auftrag = {
  id: string;
  nummer: string;
  bezeichnung: string;
  menge: number;
  kunde?: string | null;
  liefertermin?: string | null;
  abNummer?: string | null;
  notiz?: string | null;
  prioritaet?: number;
  promisedDate?: string | null;
  stalledMissingParts?: boolean;
  reworkRequired?: boolean;
  kundenauftragId?: string | null;
  kundenauftrag?: { id: string; nr: number; status: string; kunde?: { name: string } } | null;
  _count?: { abweichungen: number };
  status: string;
  start?: string | null;
  ende?: string | null;
  erstelltAm: string;
  positionen?: Array<{
    id: string;
    posNr: number;
    artikelnummer?: string | null;
    bezeichnung: string;
    menge: number;
    einheit: string;
  }>;
  zeiten?: Array<{
    id: string;
    start: string;
    ende?: string | null;
    mitarbeiter?: { name: string } | null;
    kategorie?: { name: string } | null;
  }>;
  qualitaet?: Array<{
    id: string;
    gut: number;
    ausschuss: number;
    nacharbeit: number;
    zeitstempel: string;
    mitarbeiter?: { name: string } | null;
  }>;
};

function formatDuration(start: string, ende?: string | null) {
  const s = new Date(start).getTime();
  const e = ende ? new Date(ende).getTime() : Date.now();
  const min = Math.round((e - s) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

function formatDt(dt?: string | null) {
  if (!dt) return "–";
  return new Date(dt).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AuftraegePage() {
  const { me, hatRecht } = useMe();
  const darfStatus = hatRecht("auftraege.status");
  const darfVerwalten = hatRecht("verwaltung");
  const istAdmin = me?.rolle === "admin";

  // Offene Kundenaufträge für die Verknüpfung (KF3-37) — nur mit Vertriebsrecht
  const { data: kundenauftraege } = useSWR<
    Array<{ id: string; nr: number; kunde?: { name: string } }>
  >(hatRecht("vertrieb") ? "/api/kundenauftraege?status=offen" : null, fetcher);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showCreate, setShowCreate] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Auftrag>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [kommissionierAuftrag, setKommissionierAuftrag] = useState<{ id: string; nummer: string } | null>(null);
  const [pruefAuftrag, setPruefAuftrag] = useState<{ id: string; nummer: string } | null>(null);
  const [form, setForm] = useState({
    nummer: "",
    bezeichnung: "",
    menge: "",
    kunde: "",
    liefertermin: "",
    abNummer: "",
    prioritaet: "0",
    kundenauftragId: "",
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  const url =
    `/api/auftraege?q=${encodeURIComponent(search)}` +
    (statusFilter !== "alle" ? `&status=${statusFilter}` : "");
  const { data, isLoading } = useSWR(url, fetcher, { refreshInterval: 15000 });
  const { data: detail, isLoading: detailLoading } = useSWR(
    selectedId ? `/api/auftraege/${selectedId}` : null,
    fetcher
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const schema = z.object({
      nummer: z.string().trim().min(1, "Auftragsnummer erforderlich"),
      bezeichnung: z.string().trim().min(1, "Bezeichnung erforderlich"),
      menge: z.number().positive("Menge muss größer als 0 sein"),
    });
    const parsed = schema.safeParse({
      nummer: form.nummer,
      bezeichnung: form.bezeichnung,
      menge: form.menge === "" ? NaN : parseFloat(form.menge),
    });
    if (!parsed.success) {
      setCreateErrors(feldFehler(parsed.error));
      return;
    }
    setCreateErrors({});
    const res = await fetch("/api/auftraege", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        menge: parsed.data.menge,
        prioritaet: parseInt(form.prioritaet, 10),
        kundenauftragId: form.kundenauftragId || undefined,
        // Bei verknüpftem KA führt dessen Kunde (Server zieht nach)
        kunde: form.kundenauftragId ? undefined : form.kunde || undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Fehler beim Erstellen"); return; }
    toast.success(`Auftrag ${body.nummer} erstellt`);
    // Verfügbarkeitsprüfung beim Anlegen (KF3-33): Fehlteile sofort melden
    if (body.material?.mangel) {
      const fehlend = (body.material.mangelnd as Array<{ artikelnummer: string }>)
        .map((m) => m.artikelnummer).join(", ");
      toast.warning(`Material reicht nicht: ${fehlend}`, { duration: 8000 });
    }
    setShowCreate(false);
    setForm({ nummer: "", bezeichnung: "", menge: "", kunde: "", liefertermin: "", abNummer: "", prioritaet: "0", kundenauftragId: "" });
    setCreateErrors({});
    mutate(url);
  }

  async function setStatus(id: string, status: string, auftrag?: { nummer: string; status: string }) {
    // Kommissionieren läuft über den Dialog (Lagerort + Mangel-/force-Behandlung)
    if (status === "kommissioniert" && auftrag?.status === "offen") {
      setKommissionierAuftrag({ id, nummer: auftrag.nummer });
      return;
    }
    const res = await fetch(`/api/auftraege/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Endprüf-Gate (KF3-26): Abschluss ohne Prüfung → Prüfdialog öffnen
      if (res.status === 409 && body.error === "pruefungFehlt") {
        setPruefAuftrag({ id, nummer: auftrag?.nummer ?? "" });
        return;
      }
      toast.error(body.error ?? "Statusänderung fehlgeschlagen");
      return;
    }
    mutate(url);
    if (selectedId === id) mutate(`/api/auftraege/${id}`);
  }

  async function handleSaveEdit() {
    if (!selectedId) return;
    const res = await fetch(`/api/auftraege/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) { toast.error("Speichern fehlgeschlagen"); return; }
    toast.success("Gespeichert");
    setEditMode(false);
    mutate(`/api/auftraege/${selectedId}`);
    mutate(url);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/auftraege/${deleteId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Löschen fehlgeschlagen"); return; }
    toast.success("Auftrag gelöscht");
    setDeleteId(null);
    setSelectedId(null);
    mutate(url);
  }

  function openDetail(id: string) {
    setSelectedId(id);
    setEditMode(false);
  }

  const auftraege = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Aufträge</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" />
          Neuer Auftrag
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Suche nach Nummer, Bezeichnung, AB-Nummer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => setShowScanner(true)} title="Barcode scannen">
          <QrCode className="size-4" />
        </Button>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nummer</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right">Menge</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Liefertermin</TableHead>
                <TableHead>Status</TableHead>
                {darfStatus && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(7)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : auftraege.map((a: Auftrag) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openDetail(a.id)}
                    >
                      <TableCell className="font-mono font-medium">
                        <span className="flex items-center gap-2">
                          <StatusampelPunkt
                            auftrag={{ ...a, nacharbeitOffen: (a._count?.abweichungen ?? 0) > 0 }}
                          />
                          {a.nummer}
                        </span>
                      </TableCell>
                      <TableCell>{a.bezeichnung}</TableCell>
                      <TableCell className="text-right">{a.menge}</TableCell>
                      <TableCell>{a.kunde ?? "–"}</TableCell>
                      <TableCell>{a.liefertermin ?? "–"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <PrioritaetBadge prioritaet={a.prioritaet} />
                          <Badge variant={STATUS_VARIANT[a.status] ?? "secondary"}>
                            {STATUS_LABEL[a.status] ?? a.status}
                          </Badge>
                        </div>
                      </TableCell>
                      {darfStatus && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={a.status} onValueChange={(v) => setStatus(a.id, v, a)}>
                            <SelectTrigger className="h-9 text-xs w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              {!isLoading && auftraege.length === 0 && (
                <TableRow>
                  <TableCell colSpan={darfStatus ? 7 : 6} className="text-center text-muted-foreground py-8">
                    Keine Aufträge gefunden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Detail Sheet ───────────────────────────────────────── */}
      <Sheet open={!!selectedId} onOpenChange={(o) => { if (!o) { setSelectedId(null); setEditMode(false); } }}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {detailLoading || !detail ? (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle>Auftrag laden…</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 pt-2">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            </>
          ) : (
            <>
              <SheetHeader className="pb-2">
                {/* pr-8 hält Abstand zum Schließen-X des Sheets */}
                <div className="flex items-center justify-between gap-2 pr-8">
                  <SheetTitle className="font-mono text-lg">{detail.nummer}</SheetTitle>
                  <Button size="sm" variant="outline" onClick={() => { setEditMode(!editMode); setEditForm({ bezeichnung: detail.bezeichnung, menge: detail.menge, kunde: detail.kunde, liefertermin: detail.liefertermin, abNummer: detail.abNummer, notiz: detail.notiz, prioritaet: detail.prioritaet, kundenauftragId: detail.kundenauftragId ?? null }); }}>
                    <Pencil className="size-3 mr-1" />{editMode ? "Abbrechen" : "Bearbeiten"}
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <PrioritaetBadge prioritaet={detail.prioritaet} />
                  <Badge className="w-fit" variant={STATUS_VARIANT[detail.status] ?? "secondary"}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </Badge>
                </div>
              </SheetHeader>

              <Separator className="my-3" />

              {editMode ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Bezeichnung</Label>
                    <Input value={editForm.bezeichnung ?? ""} onChange={(e) => setEditForm({ ...editForm, bezeichnung: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Menge</Label>
                      <Input type="number" value={editForm.menge ?? ""} onChange={(e) => setEditForm({ ...editForm, menge: parseFloat(e.target.value) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Kunde</Label>
                      <Input
                        value={editForm.kunde ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, kunde: e.target.value })}
                        // Relation ist führend: bei verknüpftem Kundenauftrag gesperrt
                        disabled={!!editForm.kundenauftragId}
                        title={editForm.kundenauftragId ? "Wird vom Kundenauftrag geführt" : undefined}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Liefertermin</Label>
                      <Input value={editForm.liefertermin ?? ""} onChange={(e) => setEditForm({ ...editForm, liefertermin: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>AB-Nummer</Label>
                      <Input value={editForm.abNummer ?? ""} onChange={(e) => setEditForm({ ...editForm, abNummer: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priorität</Label>
                    <Select
                      value={String(editForm.prioritaet ?? 0)}
                      onValueChange={(v) => setEditForm({ ...editForm, prioritaet: parseInt(v, 10) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITAET_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {hatRecht("vertrieb.bearbeiten") && (
                    <div className="space-y-1.5">
                      <Label>Kundenauftrag</Label>
                      <Select
                        value={editForm.kundenauftragId ?? "keiner"}
                        onValueChange={(v) => setEditForm({ ...editForm, kundenauftragId: v === "keiner" ? null : v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="– keiner –" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keiner">– keiner –</SelectItem>
                          {/* Aktuell verknüpfter KA auch anzeigen, wenn er nicht mehr offen ist */}
                          {detail.kundenauftrag &&
                            !(Array.isArray(kundenauftraege) ? kundenauftraege : []).some((ka) => ka.id === detail.kundenauftrag?.id) && (
                              <SelectItem value={detail.kundenauftrag.id}>
                                KA-{detail.kundenauftrag.nr} · {detail.kundenauftrag.kunde?.name} ({detail.kundenauftrag.status})
                              </SelectItem>
                            )}
                          {(Array.isArray(kundenauftraege) ? kundenauftraege : []).map((ka) => (
                            <SelectItem key={ka.id} value={ka.id}>
                              KA-{ka.nr} · {ka.kunde?.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Notiz</Label>
                    <Textarea value={editForm.notiz ?? ""} onChange={(e) => setEditForm({ ...editForm, notiz: e.target.value })} rows={3} />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveEdit}>Speichern</Button>
                    <Button variant="outline" onClick={() => setEditMode(false)}>Abbrechen</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Bezeichnung</span>
                    <span className="font-medium">{detail.bezeichnung}</span>
                    <span className="text-muted-foreground">Menge</span>
                    <span>{detail.menge}</span>
                    <span className="text-muted-foreground">Kunde</span>
                    <span>{detail.kunde ?? "–"}</span>
                    <span className="text-muted-foreground">Kundenauftrag</span>
                    <span>
                      {detail.kundenauftrag
                        ? `KA-${detail.kundenauftrag.nr} · ${detail.kundenauftrag.kunde?.name ?? ""}`
                        : "–"}
                    </span>
                    <span className="text-muted-foreground">Liefertermin</span>
                    <span>{detail.liefertermin ?? "–"}</span>
                    <span className="text-muted-foreground">AB-Nummer</span>
                    <span>{detail.abNummer ?? "–"}</span>
                    <span className="text-muted-foreground">Start</span>
                    <span>{formatDt(detail.start)}</span>
                    <span className="text-muted-foreground">Ende</span>
                    <span>{formatDt(detail.ende)}</span>
                    <span className="text-muted-foreground">Erstellt</span>
                    <span>{formatDt(detail.erstelltAm)}</span>
                  </div>
                  {detail.notiz && (
                    <div className="mt-2 p-2 bg-muted rounded text-xs">{detail.notiz}</div>
                  )}
                  {darfStatus && (
                    <div className="pt-2">
                      <Label className="text-xs text-muted-foreground">Status ändern</Label>
                      <Select value={detail.status} onValueChange={(v) => setStatus(detail.id, v, detail)}>
                        <SelectTrigger className="mt-1 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <Separator className="my-3" />

              <Tabs defaultValue="positionen">
                <TabsList className="w-full">
                  <TabsTrigger value="positionen" className="flex-1">
                    Positionen ({detail.positionen?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="material" className="flex-1">
                    Material
                  </TabsTrigger>
                  <TabsTrigger value="zeiten" className="flex-1">
                    Zeiten ({detail.zeiten?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="qualitaet" className="flex-1">
                    Qualität ({detail.qualitaet?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="dateien" className="flex-1">
                    Dateien ({detail.dateien?.length ?? 0})
                  </TabsTrigger>
                  <TabsTrigger value="versand" className="flex-1">
                    Versand & Team
                  </TabsTrigger>
                  <TabsTrigger value="verlauf" className="flex-1">
                    Verlauf
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="verlauf" className="mt-3">
                  <AuftragVerlauf auftragId={detail.id} />
                </TabsContent>

                <TabsContent value="material" className="mt-3">
                  <MaterialbedarfBlock auftragId={detail.id} />
                </TabsContent>

                <TabsContent value="dateien" className="mt-3">
                  <AuftragDateien auftragId={detail.id} istAdmin={istAdmin} />
                </TabsContent>

                <TabsContent value="versand" className="mt-3 space-y-4">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Team (Arbeitsvorrat)</h3>
                    <AuftragTeam
                      auftragId={detail.id}
                      auftragNummer={detail.nummer}
                      team={detail.team ?? []}
                      darfVerwalten={darfVerwalten}
                    />
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Packmaße</h3>
                    <PackmasseEditor
                      auftragId={detail.id}
                      packmasse={detail.packmasse ?? []}
                      darfBearbeiten={darfStatus}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="positionen" className="mt-3">
                  {detail.positionen?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Keine Positionen</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Pos.</TableHead>
                          <TableHead>Artikel</TableHead>
                          <TableHead>Bezeichnung</TableHead>
                          <TableHead className="text-right">Menge</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.positionen?.map((p: { id: string; posNr: number; artikelnummer?: string | null; bezeichnung: string; menge: number; einheit: string }) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-muted-foreground">{p.posNr}</TableCell>
                            <TableCell className="font-mono text-xs">{p.artikelnummer ?? "–"}</TableCell>
                            <TableCell>{p.bezeichnung}</TableCell>
                            <TableCell className="text-right">{p.menge} {p.einheit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="zeiten" className="mt-3">
                  {detail.zeiten?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Keine Zeitbuchungen</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mitarbeiter</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>Dauer</TableHead>
                          <TableHead>Kategorie</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.zeiten?.map((z: { id: string; start: string; ende?: string | null; mitarbeiter?: { name: string } | null; kategorie?: { name: string } | null }) => (
                          <TableRow key={z.id}>
                            <TableCell>{z.mitarbeiter?.name ?? "–"}</TableCell>
                            <TableCell className="text-xs">{formatDt(z.start)}</TableCell>
                            <TableCell className="text-xs">{formatDuration(z.start, z.ende)}</TableCell>
                            <TableCell className="text-xs">{z.kategorie?.name ?? "–"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="qualitaet" className="mt-3 space-y-4">
                  <AbweichungBlock auftragId={detail.id} />
                  <Separator />
                  {detail.qualitaet?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Keine Qualitätseinträge</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead className="text-right text-green-600">Gut</TableHead>
                          <TableHead className="text-right text-red-600">Ausschuss</TableHead>
                          <TableHead className="text-right text-yellow-600">Nacharbeit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.qualitaet?.map((q: { id: string; zeitstempel: string; gut: number; ausschuss: number; nacharbeit: number; mitarbeiter?: { name: string } | null }) => (
                          <TableRow key={q.id}>
                            <TableCell className="text-xs">{formatDt(q.zeitstempel)}</TableCell>
                            <TableCell className="text-right">{q.gut}</TableCell>
                            <TableCell className="text-right">{q.ausschuss}</TableCell>
                            <TableCell className="text-right">{q.nacharbeit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>

              {/* Löschen bewusst unten, weit weg vom Schließen-X */}
              {istAdmin && (
                <>
                  <Separator className="my-4" />
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteId(detail.id)}
                  >
                    <Trash2 className="size-4 mr-2" /> Auftrag löschen
                  </Button>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Neuer Auftrag Dialog ───────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuer Auftrag</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Auftragsnummer *</Label>
                <Input required value={form.nummer} onChange={(e) => setForm({ ...form, nummer: e.target.value })} />
                {createErrors.nummer && <p className="text-destructive text-xs">{createErrors.nummer}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Menge *</Label>
                <Input required type="number" min="0.001" step="any" value={form.menge} onChange={(e) => setForm({ ...form, menge: e.target.value })} />
                {createErrors.menge && <p className="text-destructive text-xs">{createErrors.menge}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bezeichnung *</Label>
              <Input required value={form.bezeichnung} onChange={(e) => setForm({ ...form, bezeichnung: e.target.value })} />
              {createErrors.bezeichnung && <p className="text-destructive text-xs">{createErrors.bezeichnung}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kunde</Label>
                <Input
                  value={form.kundenauftragId ? "wird vom Kundenauftrag geführt" : form.kunde}
                  onChange={(e) => setForm({ ...form, kunde: e.target.value })}
                  disabled={!!form.kundenauftragId}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Liefertermin</Label>
                <Input value={form.liefertermin} onChange={(e) => setForm({ ...form, liefertermin: e.target.value })} placeholder="z.B. KW 25/2026" />
              </div>
            </div>
            {hatRecht("vertrieb.bearbeiten") && (
              <div className="space-y-1.5">
                <Label>Kundenauftrag (KF3-37)</Label>
                <Select
                  value={form.kundenauftragId || "keiner"}
                  onValueChange={(v) => setForm({ ...form, kundenauftragId: v === "keiner" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="– keiner –" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keiner">– keiner –</SelectItem>
                    {(Array.isArray(kundenauftraege) ? kundenauftraege : []).map((ka) => (
                      <SelectItem key={ka.id} value={ka.id}>
                        KA-{ka.nr} · {ka.kunde?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>AB-Nummer</Label>
                <Input value={form.abNummer} onChange={(e) => setForm({ ...form, abNummer: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Priorität</Label>
                <Select value={form.prioritaet} onValueChange={(v) => setForm({ ...form, prioritaet: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITAET_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
              <Button type="submit">Erstellen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onResult={(code) => { setSearch(code); setShowScanner(false); }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Auftrag löschen?"
        description="Der Auftrag und alle zugehörigen Positionen, Zeiten und Qualitätsdaten werden dauerhaft entfernt."
        confirmLabel="Löschen"
        onConfirm={confirmDelete}
      />

      <PruefungDialog
        auftrag={pruefAuftrag}
        open={!!pruefAuftrag}
        onOpenChange={(o) => { if (!o) setPruefAuftrag(null); }}
        onFreigabe={() => {
          if (pruefAuftrag) {
            setStatus(pruefAuftrag.id, "abgeschlossen", { nummer: pruefAuftrag.nummer, status: "laeuft" });
          }
          setPruefAuftrag(null);
        }}
      />

      <KommissionierDialog
        auftrag={kommissionierAuftrag}
        open={!!kommissionierAuftrag}
        onOpenChange={(o) => { if (!o) setKommissionierAuftrag(null); }}
        onDone={() => {
          mutate(url);
          if (kommissionierAuftrag) {
            mutate(`/api/auftraege/${kommissionierAuftrag.id}`);
            mutate(`/api/material/bedarf/${kommissionierAuftrag.id}`);
          }
        }}
      />
    </div>
  );
}
