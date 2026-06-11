"use client";

import { useState } from "react";
import { z } from "zod";
import { feldFehler } from "@/lib/form-errors";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, QrCode, Search, Pencil, Trash2, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { KommissionierungTab } from "@/components/material/kommissionierung-tab";
import { StuecklisteEditor } from "@/components/material/stueckliste-editor";
import { InventurTab } from "@/components/material/inventur-tab";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const BEWEGUNGSART_LABEL: Record<string, string> = {
  wareneingang: "Wareneingang",
  entnahme: "Entnahme",
  umlagerung: "Umlagerung",
  inventur: "Inventur",
  korrektur: "Korrektur",
  fertigmeldung: "Fertigmeldung",
};

const BEWEGUNGSART_COLOR: Record<string, string> = {
  wareneingang: "default",
  entnahme: "destructive",
  umlagerung: "secondary",
  inventur: "outline",
  korrektur: "outline",
  fertigmeldung: "secondary",
};

// Manuell buchbare Arten wie V2 — Entnahme/Fertigmeldung nur über Status-Hooks.
const MANUELLE_ARTEN = ["wareneingang", "korrektur", "umlagerung", "inventur"] as const;

export default function MaterialPage() {
  const { hatRecht } = useMe();
  const darfVerwalten = hatRecht("verwaltung");
  const darfBuchen = hatRecht("lager.buchen");

  const [showBewegung, setShowBewegung] = useState(false);
  const [bewSeite, setBewSeite] = useState(0);
  const [showScanner, setShowScanner] = useState(false);
  const [artikelSearch, setArtikelSearch] = useState("");
  const [selectedArtikel, setSelectedArtikel] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    bezeichnung: "",
    einheit: "",
    mindestbestand: "",
    lagerortId: "",
    produktfamilie: "",
    langtext: "",
    vorgabezeit: "",
    lagerplatzReihe: "",
    lagerplatzRegal: "",
    lagerplatzFach: "",
    lagerplatzPlatz: "",
    bestandAktiv: true,
    gesperrt: false,
    istBasissystem: false,
  });
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteArtikelNr, setDeleteArtikelNr] = useState<string | null>(null);
  const [form, setForm] = useState({
    artikelnummer: "",
    lagerortId: "",
    lagerortZielId: "",
    art: "wareneingang",
    menge: "",
    bemerkung: "",
    einstandspreis: "",
  });
  const [bewErrors, setBewErrors] = useState<Record<string, string>>({});

  const { data: bewegungen, isLoading: bewegungenLoading } = useSWR(
    `/api/material/bewegungen?skip=${bewSeite * 100}&take=100`,
    fetcher,
    { refreshInterval: 30000 }
  );
  const { data: bestaende, isLoading: bestaendeLoading } = useSWR(
    "/api/material/bestaende", fetcher, { refreshInterval: 30000 }
  );
  const { data: lagerorte } = useSWR("/api/material/lagerorte", fetcher);
  const { data: artikel, isLoading: artikelLoading } = useSWR(
    `/api/artikel?q=${encodeURIComponent(artikelSearch)}`, fetcher
  );
  const { data: artikelDetail, isLoading: detailLoading } = useSWR(
    selectedArtikel ? `/api/artikel/${encodeURIComponent(selectedArtikel)}` : null,
    fetcher
  );

  async function handleBewegung(e: React.FormEvent) {
    e.preventDefault();
    const schema = z.object({
      artikelnummer: z.string().min(1, "Artikel wählen"),
      lagerortId: z.string().min(1, "Lagerort wählen"),
      menge: z.number().refine((m) => m !== 0 && Number.isFinite(m), "Menge ≠ 0 erforderlich"),
    });
    const parsed = schema.safeParse({
      artikelnummer: form.artikelnummer,
      lagerortId: form.lagerortId,
      menge: form.menge === "" ? NaN : parseFloat(form.menge),
    });
    const errs: Record<string, string> = parsed.success ? {} : feldFehler(parsed.error);
    if (form.art === "umlagerung" && !form.lagerortZielId) errs.lagerortZielId = "Ziellagerort wählen";
    if (Object.keys(errs).length > 0) { setBewErrors(errs); return; }
    setBewErrors({});
    const res = await fetch("/api/material/bewegungen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artikelnummer: form.artikelnummer,
        lagerortId: form.lagerortId,
        ...(form.art === "umlagerung" && form.lagerortZielId ? { lagerortZielId: form.lagerortZielId } : {}),
        art: form.art,
        menge: parseFloat(form.menge),
        ...(form.bemerkung ? { bemerkung: form.bemerkung } : {}),
        ...(form.art === "wareneingang" && form.einstandspreis
          ? { einstandspreis: parseFloat(form.einstandspreis) }
          : {}),
      }),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Fehler"); return; }
    toast.success("Bewegung gebucht");
    setShowBewegung(false);
    mutate((key) => typeof key === "string" && key.startsWith("/api/material/bewegungen"));
    mutate("/api/material/bestaende");
    if (selectedArtikel === form.artikelnummer) mutate(`/api/artikel/${encodeURIComponent(form.artikelnummer)}`);
  }

  function startEdit() {
    if (!artikelDetail) return;
    setEditForm({
      bezeichnung: artikelDetail.bezeichnung ?? "",
      einheit: artikelDetail.einheit ?? "",
      mindestbestand: artikelDetail.mindestbestand?.toString() ?? "",
      lagerortId: artikelDetail.lagerortId ?? "",
      produktfamilie: artikelDetail.produktfamilie ?? "",
      langtext: artikelDetail.langtext ?? "",
      vorgabezeit: artikelDetail.vorgabezeit?.toString() ?? "",
      lagerplatzReihe: artikelDetail.lagerplatzReihe ?? "",
      lagerplatzRegal: artikelDetail.lagerplatzRegal ?? "",
      lagerplatzFach: artikelDetail.lagerplatzFach ?? "",
      lagerplatzPlatz: artikelDetail.lagerplatzPlatz ?? "",
      bestandAktiv: artikelDetail.bestandAktiv ?? true,
      gesperrt: artikelDetail.gesperrt ?? false,
      istBasissystem: artikelDetail.istBasissystem ?? false,
    });
    setEditMode(true);
  }

  async function saveArtikel(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedArtikel) return;
    const res = await fetch(`/api/artikel/${encodeURIComponent(selectedArtikel)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bezeichnung: editForm.bezeichnung,
        einheit: editForm.einheit,
        mindestbestand: editForm.mindestbestand ? parseFloat(editForm.mindestbestand) : null,
        lagerortId: editForm.lagerortId || null,
        produktfamilie: editForm.produktfamilie || null,
        langtext: editForm.langtext || null,
        vorgabezeit: editForm.vorgabezeit ? parseFloat(editForm.vorgabezeit) : null,
        lagerplatzReihe: editForm.lagerplatzReihe || null,
        lagerplatzRegal: editForm.lagerplatzRegal || null,
        lagerplatzFach: editForm.lagerplatzFach || null,
        lagerplatzPlatz: editForm.lagerplatzPlatz || null,
        bestandAktiv: editForm.bestandAktiv,
        gesperrt: editForm.gesperrt,
        istBasissystem: editForm.istBasissystem,
      }),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Fehler"); return; }
    toast.success("Artikel gespeichert");
    setEditMode(false);
    mutate(`/api/artikel/${encodeURIComponent(selectedArtikel)}`);
    mutate((key) => typeof key === "string" && key.startsWith("/api/artikel?"));
  }

  async function renameArtikel(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedArtikel) return;
    const neu = renameValue.trim();
    if (!neu) return;
    const res = await fetch(`/api/artikel/${encodeURIComponent(selectedArtikel)}/umbenennen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ neueArtikelnummer: neu }),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Fehler"); return; }
    toast.success("Artikel umbenannt");
    setRenameOpen(false);
    setRenameValue("");
    mutate((key) => typeof key === "string" && key.startsWith("/api/artikel?"));
    mutate((key) => typeof key === "string" && key.startsWith("/api/material/bewegungen"));
    setSelectedArtikel(neu);
  }

  async function confirmDeleteArtikel() {
    if (!deleteArtikelNr) return;
    const res = await fetch(`/api/artikel/${encodeURIComponent(deleteArtikelNr)}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Fehler beim Löschen"); return; }
    toast.success("Artikel gelöscht");
    setDeleteArtikelNr(null);
    setSelectedArtikel(null);
    mutate((key) => typeof key === "string" && key.startsWith("/api/artikel?"));
  }

  const bewegungenListe = Array.isArray(bewegungen?.items) ? bewegungen.items : [];
  const bewTotal: number = bewegungen?.total ?? 0;
  const artikelListe = Array.isArray(artikel) ? artikel : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Material / Lager</h1>
        {darfBuchen && (
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => setShowScanner(true)}>
              <QrCode className="size-4" />
            </Button>
            <Button onClick={() => setShowBewegung(true)}>
              <Plus className="size-4 mr-2" />
              Bewegung buchen
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="bestand">
        <TabsList>
          <TabsTrigger value="bestand">Bestand</TabsTrigger>
          <TabsTrigger value="bewegungen">Bewegungen</TabsTrigger>
          <TabsTrigger value="kommissionierung">Kommissionierung</TabsTrigger>
          {darfBuchen && <TabsTrigger value="inventur">Inventur</TabsTrigger>}
          <TabsTrigger value="artikel">Artikel ({artikelListe.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="kommissionierung">
          <KommissionierungTab darfStatus={hatRecht("auftraege.status")} />
        </TabsContent>

        {darfBuchen && (
          <TabsContent value="inventur">
            <InventurTab />
          </TabsContent>
        )}

        <TabsContent value="bestand">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artikelnummer</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead className="text-right">Bestand</TableHead>
                    <TableHead>Einheit</TableHead>
                    <TableHead className="text-right">Mindestbestand</TableHead>
                    <TableHead>Lagerort</TableHead>
                    <TableHead>Lagerplatz</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bestaendeLoading
                    ? [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(7)].map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : (Array.isArray(bestaende) ? bestaende : []).map((b: {
                        artikelnummer: string;
                        bezeichnung: string;
                        bestand: number;
                        einheit: string;
                        mindestbestand?: number | null;
                        unterMindest: boolean;
                        lagerort?: string | null;
                        lagerplatz?: string | null;
                      }) => (
                        <TableRow
                          key={b.artikelnummer}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedArtikel(b.artikelnummer)}
                        >
                          <TableCell className="font-mono text-sm">{b.artikelnummer}</TableCell>
                          <TableCell>{b.bezeichnung}</TableCell>
                          <TableCell className={`text-right font-mono ${b.unterMindest ? "text-destructive font-semibold" : ""}`}>
                            {b.bestand}
                          </TableCell>
                          <TableCell>{b.einheit}</TableCell>
                          <TableCell className="text-right">{b.mindestbestand ?? "–"}</TableCell>
                          <TableCell className="text-sm">{b.lagerort ?? "–"}</TableCell>
                          <TableCell className="font-mono text-xs">{b.lagerplatz ?? "–"}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bewegungen">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Artikel</TableHead>
                    <TableHead>Art</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead>Lagerort</TableHead>
                    <TableHead>Bemerkung</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bewegungenLoading
                    ? [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(6)].map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : bewegungenListe.map((b: {
                        id: string;
                        gebuchtAm: string;
                        artikel: { artikelnummer: string; bezeichnung: string };
                        art: string;
                        menge: number;
                        lagerort: { name: string };
                        bemerkung?: string;
                      }) => (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedArtikel(b.artikel.artikelnummer)}
                        >
                          <TableCell className="text-sm">
                            {new Date(b.gebuchtAm).toLocaleString("de-DE")}
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-xs">{b.artikel.artikelnummer}</div>
                            <div className="text-xs text-muted-foreground">{b.artikel.bezeichnung}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={(BEWEGUNGSART_COLOR[b.art] ?? "secondary") as "default" | "secondary" | "destructive" | "outline"} className="text-xs">
                              {BEWEGUNGSART_LABEL[b.art] ?? b.art}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{b.menge}</TableCell>
                          <TableCell className="text-sm">{b.lagerort.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{b.bemerkung ?? "–"}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
              {bewTotal > 100 && (
                <div className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span className="text-muted-foreground">
                    {bewSeite * 100 + 1}–{Math.min((bewSeite + 1) * 100, bewTotal)} von {bewTotal}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={bewSeite === 0} onClick={() => setBewSeite((s) => Math.max(0, s - 1))}>
                      Zurück
                    </Button>
                    <Button variant="outline" size="sm" disabled={(bewSeite + 1) * 100 >= bewTotal} onClick={() => setBewSeite((s) => s + 1)}>
                      Weiter
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="artikel">
          <div className="mb-3 relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Suche nach Artikelnummer oder Bezeichnung…"
              value={artikelSearch}
              onChange={(e) => setArtikelSearch(e.target.value)}
            />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artikelnummer</TableHead>
                    <TableHead>Bezeichnung</TableHead>
                    <TableHead>Lagerort</TableHead>
                    <TableHead>Einheit</TableHead>
                    <TableHead className="text-right">Mindestbestand</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artikelLoading
                    ? [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(5)].map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : artikelListe.map((a: {
                        artikelnummer: string;
                        bezeichnung: string;
                        lagerort?: { name: string } | null;
                        einheit: string;
                        mindestbestand?: number | null;
                      }) => (
                        <TableRow
                          key={a.artikelnummer}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedArtikel(a.artikelnummer)}
                        >
                          <TableCell className="font-mono text-sm">{a.artikelnummer}</TableCell>
                          <TableCell>{a.bezeichnung}</TableCell>
                          <TableCell>{a.lagerort?.name ?? "–"}</TableCell>
                          <TableCell>{a.einheit}</TableCell>
                          <TableCell className="text-right">{a.mindestbestand ?? "–"}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Artikel Detail Sheet ──────────────────────────────── */}
      <Sheet open={!!selectedArtikel} onOpenChange={(o) => { if (!o) { setSelectedArtikel(null); setEditMode(false); } }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {detailLoading || !artikelDetail ? (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle>Artikel laden…</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 pt-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            </>
          ) : (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle className="font-mono">{artikelDetail.artikelnummer}</SheetTitle>
                <p className="text-sm text-muted-foreground">{artikelDetail.bezeichnung}</p>
              </SheetHeader>

              <Separator className="my-3" />

              {editMode ? (
                <form onSubmit={saveArtikel} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Bezeichnung *</Label>
                    <Input required value={editForm.bezeichnung} onChange={(e) => setEditForm({ ...editForm, bezeichnung: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Einheit</Label>
                      <Input value={editForm.einheit} onChange={(e) => setEditForm({ ...editForm, einheit: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Mindestbestand</Label>
                      <Input type="number" step="any" value={editForm.mindestbestand} onChange={(e) => setEditForm({ ...editForm, mindestbestand: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lagerort</Label>
                    <Select value={editForm.lagerortId || "none"} onValueChange={(v) => setEditForm({ ...editForm, lagerortId: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Kein" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein</SelectItem>
                        {(Array.isArray(lagerorte) ? lagerorte : []).map((l: { id: string; name: string }) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Produktfamilie</Label>
                      <Input value={editForm.produktfamilie} onChange={(e) => setEditForm({ ...editForm, produktfamilie: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vorgabezeit (min/Stk)</Label>
                      <Input type="number" min="0" step="any" value={editForm.vorgabezeit} onChange={(e) => setEditForm({ ...editForm, vorgabezeit: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lagerplatz (Reihe / Regal / Fach / Platz)</Label>
                    <div className="grid grid-cols-4 gap-2">
                      <Input placeholder="Reihe" value={editForm.lagerplatzReihe} onChange={(e) => setEditForm({ ...editForm, lagerplatzReihe: e.target.value })} />
                      <Input placeholder="Regal" value={editForm.lagerplatzRegal} onChange={(e) => setEditForm({ ...editForm, lagerplatzRegal: e.target.value })} />
                      <Input placeholder="Fach" value={editForm.lagerplatzFach} onChange={(e) => setEditForm({ ...editForm, lagerplatzFach: e.target.value })} />
                      <Input placeholder="Platz" value={editForm.lagerplatzPlatz} onChange={(e) => setEditForm({ ...editForm, lagerplatzPlatz: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Langtext</Label>
                    <Textarea rows={2} value={editForm.langtext} onChange={(e) => setEditForm({ ...editForm, langtext: e.target.value })} />
                  </div>
                  <div className="space-y-2 rounded border p-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-bestand" className="text-sm font-normal">Bestand führen</Label>
                      <Switch id="sw-bestand" checked={editForm.bestandAktiv} onCheckedChange={(c) => setEditForm({ ...editForm, bestandAktiv: c })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-basis" className="text-sm font-normal">Basissystem (Beleg-Import-Produkterkennung)</Label>
                      <Switch id="sw-basis" checked={editForm.istBasissystem} onCheckedChange={(c) => setEditForm({ ...editForm, istBasissystem: c })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sw-gesperrt" className="text-sm font-normal text-destructive">Gesperrt</Label>
                      <Switch id="sw-gesperrt" checked={editForm.gesperrt} onCheckedChange={(c) => setEditForm({ ...editForm, gesperrt: c })} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">Speichern</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditMode(false)}>Abbrechen</Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Einheit</span>
                    <span>{artikelDetail.einheit}</span>
                    <span className="text-muted-foreground">Lagerort</span>
                    <span>{artikelDetail.lagerort?.name ?? "–"}</span>
                    <span className="text-muted-foreground">Mindestbestand</span>
                    <span>{artikelDetail.mindestbestand ?? "–"}</span>
                    <span className="text-muted-foreground">Vorgabezeit</span>
                    <span>{artikelDetail.vorgabezeit ? `${artikelDetail.vorgabezeit} min` : "–"}</span>
                    <span className="text-muted-foreground">Produktfamilie</span>
                    <span>{artikelDetail.produktfamilie ?? "–"}</span>
                    {(artikelDetail.lagerplatzReihe || artikelDetail.lagerplatzRegal) && (
                      <>
                        <span className="text-muted-foreground">Lagerplatz</span>
                        <span className="font-mono text-xs">
                          {[artikelDetail.lagerplatzReihe, artikelDetail.lagerplatzRegal, artikelDetail.lagerplatzFach, artikelDetail.lagerplatzPlatz].filter(Boolean).join(" / ")}
                        </span>
                      </>
                    )}
                  </div>

                  {artikelDetail.langtext && (
                    <div className="mt-3 p-2 bg-muted rounded text-xs">{artikelDetail.langtext}</div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {darfBuchen && (
                      <Button size="sm" onClick={() => { setForm((f) => ({ ...f, artikelnummer: artikelDetail.artikelnummer })); setShowBewegung(true); }}>
                        <Plus className="size-3 mr-1" /> Bewegung buchen
                      </Button>
                    )}
                    {darfVerwalten && (
                      <>
                        <Button size="sm" variant="outline" onClick={startEdit}>
                          <Pencil className="size-3 mr-1" /> Bearbeiten
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setRenameValue(artikelDetail.artikelnummer); setRenameOpen(true); }}>
                          <Tag className="size-3 mr-1" /> Umbenennen
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteArtikelNr(artikelDetail.artikelnummer)}>
                          <Trash2 className="size-3 mr-1" /> Löschen
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}

              <Separator className="my-3" />

              <h3 className="text-sm font-semibold mb-2">
                Letzte Bewegungen ({artikelDetail.materialbewegungen?.length ?? 0})
              </h3>
              {artikelDetail.materialbewegungen?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Bewegungen</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Art</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead>Auftrag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {artikelDetail.materialbewegungen?.map((b: {
                      id: string;
                      gebuchtAm: string;
                      art: string;
                      menge: number;
                      auftrag?: { nummer: string } | null;
                      lagerort: { name: string };
                    }) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs">
                          {new Date(b.gebuchtAm).toLocaleDateString("de-DE")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {BEWEGUNGSART_LABEL[b.art] ?? b.art}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{b.menge}</TableCell>
                        <TableCell className="font-mono text-xs">{b.auftrag?.nummer ?? "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <Separator className="my-3" />
              <StuecklisteEditor
                artikelnummer={artikelDetail.artikelnummer}
                darfVerwalten={darfVerwalten}
                onNavigate={setSelectedArtikel}
              />

              {artikelDetail.lieferanten?.length > 0 && (
                <>
                  <Separator className="my-3" />
                  <h3 className="text-sm font-semibold mb-2">
                    Lieferanten ({artikelDetail.lieferanten.length})
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lieferant</TableHead>
                        <TableHead className="text-right">Preis</TableHead>
                        <TableHead className="text-right">Mindestmenge</TableHead>
                        <TableHead className="text-right">Lieferzeit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {artikelDetail.lieferanten.map((l: {
                        id: string;
                        einkaufspreis: string | number;
                        mindestmenge: number;
                        lieferant: { name: string; lieferzeitTage: number };
                      }) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">{l.lieferant.name}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {Number(l.einkaufspreis).toFixed(2)} €
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{l.mindestmenge}</TableCell>
                          <TableCell className="text-right text-xs">{l.lieferant.lieferzeitTage} Tage</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Bewegung buchen Dialog ────────────────────────────── */}
      <Dialog open={showBewegung} onOpenChange={setShowBewegung}>
        <DialogContent>
          <DialogHeader><DialogTitle>Materialbewegung buchen</DialogTitle></DialogHeader>
          <form onSubmit={handleBewegung} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Artikel *</Label>
              <Select value={form.artikelnummer} onValueChange={(v) => setForm({ ...form, artikelnummer: v })}>
                <SelectTrigger><SelectValue placeholder="Artikel wählen…" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(artikel) ? artikel : []).map((a: { artikelnummer: string; bezeichnung: string }) => (
                    <SelectItem key={a.artikelnummer} value={a.artikelnummer}>
                      {a.artikelnummer} – {a.bezeichnung}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bewErrors.artikelnummer && <p className="text-destructive text-xs">{bewErrors.artikelnummer}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Art *</Label>
                <Select value={form.art} onValueChange={(v) => setForm({ ...form, art: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MANUELLE_ARTEN.map((v) => (
                      <SelectItem key={v} value={v}>{BEWEGUNGSART_LABEL[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Menge *</Label>
                <Input
                  required
                  type="number"
                  min={form.art === "korrektur" || form.art === "inventur" ? undefined : "0.001"}
                  step="any"
                  value={form.menge}
                  onChange={(e) => setForm({ ...form, menge: e.target.value })}
                />
                {(form.art === "korrektur" || form.art === "inventur") && (
                  <p className="text-xs text-muted-foreground">Negative Menge = Abbuchung</p>
                )}
                {bewErrors.menge && <p className="text-destructive text-xs">{bewErrors.menge}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{form.art === "umlagerung" ? "Von Lagerort *" : "Lagerort *"}</Label>
              <Select value={form.lagerortId} onValueChange={(v) => setForm({ ...form, lagerortId: v })}>
                <SelectTrigger><SelectValue placeholder="Lagerort wählen…" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(lagerorte) ? lagerorte : []).map((l: { id: string; name: string }) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bewErrors.lagerortId && <p className="text-destructive text-xs">{bewErrors.lagerortId}</p>}
            </div>
            {form.art === "umlagerung" && (
              <div className="space-y-1.5">
                <Label>Nach Lagerort *</Label>
                <Select value={form.lagerortZielId} onValueChange={(v) => setForm({ ...form, lagerortZielId: v })}>
                  <SelectTrigger><SelectValue placeholder="Ziellagerort wählen…" /></SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(lagerorte) ? lagerorte : [])
                      .filter((l: { id: string }) => l.id !== form.lagerortId)
                      .map((l: { id: string; name: string }) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {bewErrors.lagerortZielId && <p className="text-destructive text-xs">{bewErrors.lagerortZielId}</p>}
              </div>
            )}
            {form.art === "wareneingang" && (
              <div className="space-y-1.5">
                <Label>Einstandspreis (€/Stk)</Label>
                <Input type="number" min="0" step="any" value={form.einstandspreis} onChange={(e) => setForm({ ...form, einstandspreis: e.target.value })} />
                <p className="text-xs text-muted-foreground">Optional — für die wertmäßige Materialbewertung.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Bemerkung</Label>
              <Input value={form.bemerkung} onChange={(e) => setForm({ ...form, bemerkung: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowBewegung(false)}>Abbrechen</Button>
              <Button type="submit">Buchen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Artikel umbenennen ────────────────────────────── */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Artikel umbenennen</DialogTitle></DialogHeader>
          <form onSubmit={renameArtikel} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Neue Artikelnummer *</Label>
              <Input required value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Alle Positionen, Bewegungen und Stücklisten werden automatisch umgehängt.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>Abbrechen</Button>
              <Button type="submit">Umbenennen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteArtikelNr}
        onOpenChange={(o) => { if (!o) setDeleteArtikelNr(null); }}
        title="Artikel löschen?"
        description="Der Artikel wird dauerhaft entfernt. Artikel mit gebuchten Bewegungen oder Auftragspositionen können nicht gelöscht werden."
        confirmLabel="Löschen"
        onConfirm={confirmDeleteArtikel}
      />

      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onResult={(code) => {
          setForm((f) => ({ ...f, artikelnummer: code }));
          setShowScanner(false);
          setShowBewegung(true);
        }}
      />
    </div>
  );
}
