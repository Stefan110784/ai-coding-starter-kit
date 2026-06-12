"use client";

import { useState } from "react";
import { z } from "zod";
import { feldFehler } from "@/lib/form-errors";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, UserPlus, Pencil, Trash2, KeyRound, UserCog } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BelegImportTab } from "@/components/beleg-import-tab";
import { ZuweisungUebersicht } from "@/components/zuweisung-uebersicht";
import { AbweichungsGruendeTab } from "@/components/abweichungsgruende-tab";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ROLLEN = [
  { value: "mitarbeiter", label: "Mitarbeiter" },
  { value: "kommissionierung", label: "Kommissionierung" },
  { value: "admin", label: "Administrator" },
];

interface Mitarbeiter {
  id: string;
  kuerzel: string;
  name: string;
  status: string;
  wochenstunden?: number | null;
  benutzer?: { username: string; rolle: string } | null;
}
interface Lagerort {
  id: string;
  name: string;
  kuerzel: string;
  aktiv: boolean;
}
interface Zeitkategorie {
  id: string;
  name: string;
  sortorder: number;
  auftragsbezogen?: boolean;
}
interface BenutzerEintrag {
  id: string;
  username: string;
  name: string | null;
  rolle: string;
  aktiv: boolean;
  rechte: string[];
  rechteExplizit: boolean;
}
interface RechteGruppe {
  key: string;
  label: string;
  funktionen: { key: string; label: string }[];
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function VerwaltungPage() {
  const { data: mitarbeiter, isLoading: maLoading } = useSWR<Mitarbeiter[]>("/api/mitarbeiter?aktiv=false", fetcher);
  const { data: lagerorte, isLoading: loLoading } = useSWR<Lagerort[]>("/api/material/lagerorte?alle=true", fetcher);
  const { data: kategorien, isLoading: katLoading } = useSWR<Zeitkategorie[]>("/api/zeitkategorien", fetcher);
  const { data: benutzer, isLoading: beLoading } = useSWR<BenutzerEintrag[]>("/api/benutzer", fetcher);
  const { data: rechteKatalog } = useSWR<RechteGruppe[]>("/api/benutzer/rechte-katalog", fetcher);

  // ── Mitarbeiter ──
  const [maCreate, setMaCreate] = useState(false);
  const [maForm, setMaForm] = useState({ name: "", kuerzel: "" });
  const [maEdit, setMaEdit] = useState<Mitarbeiter | null>(null);
  const [maDeactivate, setMaDeactivate] = useState<Mitarbeiter | null>(null);
  const [kontoFor, setKontoFor] = useState<Mitarbeiter | null>(null);
  const [kontoForm, setKontoForm] = useState({ username: "", rolle: "mitarbeiter", passwort: "" });
  const [kontoErrors, setKontoErrors] = useState<Record<string, string>>({});

  // ── Lagerorte ──
  const [loCreate, setLoCreate] = useState(false);
  const [loForm, setLoForm] = useState({ name: "", kuerzel: "" });
  const [loEdit, setLoEdit] = useState<Lagerort | null>(null);

  // ── Zeitkategorien ──
  const [katDialog, setKatDialog] = useState<Zeitkategorie | "new" | null>(null);
  const [katForm, setKatForm] = useState({ name: "", sortorder: "0", auftragsbezogen: true });
  const [katDelete, setKatDelete] = useState<Zeitkategorie | null>(null);

  // ── Benutzer ──
  const [beCreate, setBeCreate] = useState(false);
  const [beForm, setBeForm] = useState({ username: "", name: "", rolle: "mitarbeiter", passwort: "" });
  const [beErrors, setBeErrors] = useState<Record<string, string>>({});
  const [beEdit, setBeEdit] = useState<BenutzerEintrag | null>(null);
  const [beRechte, setBeRechte] = useState<Set<string>>(new Set());
  const [beReset, setBeReset] = useState<BenutzerEintrag | null>(null);
  const [beDelete, setBeDelete] = useState<BenutzerEintrag | null>(null);

  const reloadMa = () => mutate("/api/mitarbeiter?aktiv=false");
  const reloadLo = () => mutate("/api/material/lagerorte?alle=true");
  const reloadKat = () => mutate("/api/zeitkategorien");
  const reloadBe = () => mutate("/api/benutzer");

  // ── Mitarbeiter-Handler ──
  async function createMitarbeiter(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await send("/api/mitarbeiter", "POST", maForm);
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Mitarbeiter angelegt");
    setMaCreate(false);
    setMaForm({ name: "", kuerzel: "" });
    reloadMa();
  }
  async function saveMitarbeiter(e: React.FormEvent) {
    e.preventDefault();
    if (!maEdit) return;
    const { ok, data } = await send(`/api/mitarbeiter/${maEdit.id}`, "PATCH", {
      name: maEdit.name,
      kuerzel: maEdit.kuerzel,
      status: maEdit.status,
      wochenstunden: maEdit.wochenstunden ?? null,
    });
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Mitarbeiter gespeichert");
    setMaEdit(null);
    reloadMa();
  }
  async function deactivateMitarbeiter() {
    if (!maDeactivate) return;
    const { ok, data } = await send(`/api/mitarbeiter/${maDeactivate.id}`, "DELETE");
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Mitarbeiter deaktiviert");
    setMaDeactivate(null);
    reloadMa();
  }
  async function createKonto(e: React.FormEvent) {
    e.preventDefault();
    if (!kontoFor) return;
    const parsed = z
      .object({
        username: z.string().trim().min(1, "Benutzername erforderlich"),
        passwort: z.string().optional().refine((p) => !p || p.length >= 4, "Mindestens 4 Zeichen"),
      })
      .safeParse({ username: kontoForm.username, passwort: kontoForm.passwort });
    if (!parsed.success) { setKontoErrors(feldFehler(parsed.error)); return; }
    setKontoErrors({});
    const { ok, data } = await send("/api/benutzer", "POST", {
      username: kontoForm.username,
      name: kontoFor.name,
      rolle: kontoForm.rolle,
      passwort: kontoForm.passwort || undefined,
      mitarbeiterId: kontoFor.id,
    });
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success(
      data.initialPasswort
        ? `Konto angelegt – Initialpasswort: ${data.initialPasswort}`
        : "Konto angelegt",
      { duration: 20000 }
    );
    setKontoFor(null);
    setKontoForm({ username: "", rolle: "mitarbeiter", passwort: "" });
    reloadMa();
    reloadBe();
  }

  // ── Lagerort-Handler ──
  async function createLagerort(e: React.FormEvent) {
    e.preventDefault();
    const { ok, data } = await send("/api/material/lagerorte", "POST", loForm);
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Lagerort angelegt");
    setLoCreate(false);
    setLoForm({ name: "", kuerzel: "" });
    reloadLo();
  }
  async function saveLagerort(e: React.FormEvent) {
    e.preventDefault();
    if (!loEdit) return;
    const { ok, data } = await send(`/api/material/lagerorte/${loEdit.id}`, "PATCH", {
      name: loEdit.name,
      kuerzel: loEdit.kuerzel,
      aktiv: loEdit.aktiv,
    });
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Lagerort gespeichert");
    setLoEdit(null);
    reloadLo();
  }

  // ── Zeitkategorie-Handler ──
  function openKat(k: Zeitkategorie | "new") {
    setKatDialog(k);
    setKatForm(k === "new" ? { name: "", sortorder: "0", auftragsbezogen: true } : { name: k.name, sortorder: k.sortorder.toString(), auftragsbezogen: k.auftragsbezogen ?? true });
  }
  async function saveKat(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name: katForm.name, sortorder: parseInt(katForm.sortorder) || 0, auftragsbezogen: katForm.auftragsbezogen };
    const isNew = katDialog === "new";
    const { ok, data } = isNew
      ? await send("/api/zeitkategorien", "POST", payload)
      : await send(`/api/zeitkategorien/${(katDialog as Zeitkategorie).id}`, "PATCH", payload);
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success(isNew ? "Kategorie angelegt" : "Kategorie gespeichert");
    setKatDialog(null);
    reloadKat();
  }
  async function deleteKat() {
    if (!katDelete) return;
    const { ok, data } = await send(`/api/zeitkategorien/${katDelete.id}`, "DELETE");
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Kategorie gelöscht");
    setKatDelete(null);
    reloadKat();
  }

  // ── Benutzer-Handler ──
  async function createBenutzer(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z
      .object({
        username: z.string().trim().min(1, "Benutzername erforderlich"),
        passwort: z.string().optional().refine((p) => !p || p.length >= 4, "Mindestens 4 Zeichen"),
      })
      .safeParse({ username: beForm.username, passwort: beForm.passwort });
    if (!parsed.success) { setBeErrors(feldFehler(parsed.error)); return; }
    setBeErrors({});
    const { ok, data } = await send("/api/benutzer", "POST", {
      username: beForm.username,
      name: beForm.name || undefined,
      rolle: beForm.rolle,
      passwort: beForm.passwort || undefined,
    });
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success(
      data.initialPasswort
        ? `Benutzer angelegt – Initialpasswort: ${data.initialPasswort}`
        : "Benutzer angelegt",
      { duration: 20000 }
    );
    setBeCreate(false);
    setBeForm({ username: "", name: "", rolle: "mitarbeiter", passwort: "" });
    reloadBe();
  }
  function openBeEdit(b: BenutzerEintrag) {
    setBeEdit(b);
    setBeRechte(new Set(b.rechte));
  }
  function toggleRecht(key: string, on: boolean) {
    setBeRechte((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  async function saveBenutzer(e: React.FormEvent) {
    e.preventDefault();
    if (!beEdit) return;
    const payload: Record<string, unknown> = {
      name: beEdit.name,
      rolle: beEdit.rolle,
      aktiv: beEdit.aktiv,
    };
    // Rechte nur für Nicht-Admins explizit setzen (Admin hat ohnehin alle).
    if (beEdit.rolle !== "admin") payload.rechte = [...beRechte];
    const { ok, data } = await send(`/api/benutzer/${beEdit.id}`, "PATCH", payload);
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Benutzer gespeichert");
    setBeEdit(null);
    reloadBe();
  }
  async function resetBenutzer() {
    if (!beReset) return;
    const { ok, data } = await send(`/api/benutzer/${beReset.id}/reset`, "POST");
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success(`Passwort zurückgesetzt – neues Passwort: ${data.initialPasswort}`, {
      duration: 20000,
    });
    setBeReset(null);
  }
  async function deleteBenutzer() {
    if (!beDelete) return;
    const { ok, data } = await send(`/api/benutzer/${beDelete.id}`, "DELETE");
    if (!ok) return toast.error(data.error ?? "Fehler");
    toast.success("Benutzer gelöscht");
    setBeDelete(null);
    reloadBe();
  }

  const maListe = Array.isArray(mitarbeiter) ? mitarbeiter : [];
  const loListe = Array.isArray(lagerorte) ? lagerorte : [];
  const katListe = Array.isArray(kategorien) ? kategorien : [];
  const beListe = Array.isArray(benutzer) ? benutzer : [];
  const katalog = Array.isArray(rechteKatalog) ? rechteKatalog : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Verwaltung</h1>

      <Tabs defaultValue="mitarbeiter">
        <TabsList>
          <TabsTrigger value="mitarbeiter">Mitarbeiter</TabsTrigger>
          <TabsTrigger value="benutzer">Benutzer</TabsTrigger>
          <TabsTrigger value="lagerorte">Lagerorte</TabsTrigger>
          <TabsTrigger value="kategorien">Zeitkategorien</TabsTrigger>
          <TabsTrigger value="gruende">Abweichungsgründe</TabsTrigger>
          <TabsTrigger value="arbeitsvorrat">Arbeitsvorrat</TabsTrigger>
          <TabsTrigger value="import">Beleg-Import</TabsTrigger>
        </TabsList>

        {/* ── ABWEICHUNGSGRÜNDE (KF3-34) ── */}
        <TabsContent value="gruende">
          <AbweichungsGruendeTab />
        </TabsContent>

        {/* ── ARBEITSVORRAT-ZUWEISUNGEN ── */}
        <TabsContent value="arbeitsvorrat">
          <ZuweisungUebersicht />
        </TabsContent>

        {/* ── BELEG-IMPORT ── */}
        <TabsContent value="import">
          <BelegImportTab />
        </TabsContent>

        {/* ── MITARBEITER ── */}
        <TabsContent value="mitarbeiter">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setMaCreate(true)}>
              <UserPlus className="size-4 mr-2" /> Neuer Mitarbeiter
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kürzel</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Benutzerkonto</TableHead>
                      <TableHead className="text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maLoading
                      ? [...Array(3)].map((_, i) => (
                          <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                        ))
                      : maListe.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-bold">{m.kuerzel}</TableCell>
                            <TableCell>{m.name}</TableCell>
                            <TableCell>
                              <Badge variant={m.status === "aktiv" ? "default" : "secondary"}>{m.status}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {m.benutzer ? `${m.benutzer.username} (${m.benutzer.rolle})` : "–"}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {!m.benutzer && (
                                <Button size="icon" variant="ghost" title="Benutzerkonto anlegen" onClick={() => { setKontoFor(m); setKontoForm({ username: "", rolle: "mitarbeiter", passwort: "" }); }}>
                                  <UserCog className="size-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" onClick={() => setMaEdit({ ...m })}>
                                <Pencil className="size-4" />
                              </Button>
                              {m.status === "aktiv" && (
                                <Button size="icon" variant="ghost" onClick={() => setMaDeactivate(m)}>
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BENUTZER ── */}
        <TabsContent value="benutzer">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setBeCreate(true)}>
              <UserPlus className="size-4 mr-2" /> Neuer Benutzer
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Benutzername</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {beLoading
                      ? [...Array(3)].map((_, i) => (
                          <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                        ))
                      : beListe.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{b.username}</TableCell>
                            <TableCell>{b.name ?? "–"}</TableCell>
                            <TableCell>
                              <Badge variant={b.rolle === "admin" ? "default" : "secondary"}>{b.rolle}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={b.aktiv ? "default" : "secondary"}>{b.aktiv ? "aktiv" : "inaktiv"}</Badge>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Button size="icon" variant="ghost" title="Bearbeiten" onClick={() => openBeEdit(b)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Passwort zurücksetzen" onClick={() => setBeReset(b)}>
                                <KeyRound className="size-4" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Löschen" onClick={() => setBeDelete(b)}>
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LAGERORTE ── */}
        <TabsContent value="lagerorte">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setLoCreate(true)}>
              <Plus className="size-4 mr-2" /> Neuer Lagerort
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Kürzel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loLoading
                      ? [...Array(3)].map((_, i) => (
                          <TableRow key={i}>{[...Array(4)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                        ))
                      : loListe.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-medium">{l.name}</TableCell>
                            <TableCell className="font-mono">{l.kuerzel}</TableCell>
                            <TableCell>
                              <Badge variant={l.aktiv ? "default" : "secondary"}>{l.aktiv ? "Aktiv" : "Inaktiv"}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="icon" variant="ghost" onClick={() => setLoEdit({ ...l })}>
                                <Pencil className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ZEITKATEGORIEN ── */}
        <TabsContent value="kategorien">
          <div className="flex justify-end mb-3">
            <Button onClick={() => openKat("new")}>
              <Plus className="size-4 mr-2" /> Neue Kategorie
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Sortierung</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {katLoading
                    ? [...Array(3)].map((_, i) => (
                        <TableRow key={i}>{[...Array(3)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                      ))
                    : katListe.length === 0
                      ? <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">Keine Kategorien angelegt</TableCell></TableRow>
                      : katListe.map((k) => (
                          <TableRow key={k.id}>
                            <TableCell>{k.sortorder}</TableCell>
                            <TableCell>{k.name}</TableCell>
                            <TableCell className="text-right">
                              <Button size="icon" variant="ghost" onClick={() => openKat(k)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setKatDelete(k)}>
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ───────── Dialoge: Mitarbeiter ───────── */}
      <Dialog open={maCreate} onOpenChange={setMaCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Mitarbeiter</DialogTitle></DialogHeader>
          <form onSubmit={createMitarbeiter} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input required value={maForm.name} onChange={(e) => setMaForm({ ...maForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Kürzel * (max. 5 Zeichen)</Label>
              <Input required maxLength={5} value={maForm.kuerzel} onChange={(e) => setMaForm({ ...maForm, kuerzel: e.target.value.toUpperCase() })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMaCreate(false)}>Abbrechen</Button>
              <Button type="submit">Anlegen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!maEdit} onOpenChange={(o) => { if (!o) setMaEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mitarbeiter bearbeiten</DialogTitle></DialogHeader>
          {maEdit && (
            <form onSubmit={saveMitarbeiter} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input required value={maEdit.name} onChange={(e) => setMaEdit({ ...maEdit, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Kürzel *</Label>
                <Input required maxLength={5} value={maEdit.kuerzel} onChange={(e) => setMaEdit({ ...maEdit, kuerzel: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={maEdit.status} onValueChange={(v) => setMaEdit({ ...maEdit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="inaktiv">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Wochenstunden (Soll)</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  step="0.5"
                  value={maEdit.wochenstunden ?? ""}
                  onChange={(e) => setMaEdit({ ...maEdit, wochenstunden: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="z. B. 40 — Basis für den Soll-Vorschlag (KF3-35)"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMaEdit(null)}>Abbrechen</Button>
                <Button type="submit">Speichern</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!kontoFor} onOpenChange={(o) => { if (!o) setKontoFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benutzerkonto anlegen</DialogTitle>
            <DialogDescription>Für {kontoFor?.name}. Ohne Passwort wird ein zufälliges Initialpasswort erzeugt und nach dem Anlegen angezeigt.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createKonto} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Benutzername *</Label>
              <Input required value={kontoForm.username} onChange={(e) => setKontoForm({ ...kontoForm, username: e.target.value })} />
              {kontoErrors.username && <p className="text-destructive text-xs">{kontoErrors.username}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Rolle</Label>
              <Select value={kontoForm.rolle} onValueChange={(v) => setKontoForm({ ...kontoForm, rolle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLLEN.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Passwort (optional)</Label>
              <Input type="password" value={kontoForm.passwort} onChange={(e) => setKontoForm({ ...kontoForm, passwort: e.target.value })} />
              {kontoErrors.passwort && <p className="text-destructive text-xs">{kontoErrors.passwort}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setKontoFor(null)}>Abbrechen</Button>
              <Button type="submit">Konto anlegen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!maDeactivate}
        onOpenChange={(o) => { if (!o) setMaDeactivate(null); }}
        title="Mitarbeiter deaktivieren?"
        description="Der Mitarbeiter wird auf inaktiv gesetzt. Bestehende Zeit- und Qualitätsbuchungen bleiben erhalten."
        confirmLabel="Deaktivieren"
        onConfirm={deactivateMitarbeiter}
      />

      {/* ───────── Dialoge: Lagerorte ───────── */}
      <Dialog open={loCreate} onOpenChange={setLoCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Lagerort</DialogTitle></DialogHeader>
          <form onSubmit={createLagerort} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input required value={loForm.name} onChange={(e) => setLoForm({ ...loForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Kürzel *</Label>
              <Input required value={loForm.kuerzel} onChange={(e) => setLoForm({ ...loForm, kuerzel: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLoCreate(false)}>Abbrechen</Button>
              <Button type="submit">Anlegen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!loEdit} onOpenChange={(o) => { if (!o) setLoEdit(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lagerort bearbeiten</DialogTitle></DialogHeader>
          {loEdit && (
            <form onSubmit={saveLagerort} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input required value={loEdit.name} onChange={(e) => setLoEdit({ ...loEdit, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Kürzel *</Label>
                <Input required value={loEdit.kuerzel} onChange={(e) => setLoEdit({ ...loEdit, kuerzel: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="lo-aktiv" checked={loEdit.aktiv} onCheckedChange={(c) => setLoEdit({ ...loEdit, aktiv: !!c })} />
                <Label htmlFor="lo-aktiv">Aktiv</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setLoEdit(null)}>Abbrechen</Button>
                <Button type="submit">Speichern</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ───────── Dialoge: Zeitkategorien ───────── */}
      <Dialog open={!!katDialog} onOpenChange={(o) => { if (!o) setKatDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{katDialog === "new" ? "Neue Kategorie" : "Kategorie bearbeiten"}</DialogTitle></DialogHeader>
          <form onSubmit={saveKat} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input required value={katForm.name} onChange={(e) => setKatForm({ ...katForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Sortierung</Label>
              <Input type="number" value={katForm.sortorder} onChange={(e) => setKatForm({ ...katForm, sortorder: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="kat-auftragsbezogen"
                checked={katForm.auftragsbezogen}
                onCheckedChange={(c) => setKatForm({ ...katForm, auftragsbezogen: !!c })}
              />
              <Label htmlFor="kat-auftragsbezogen">
                Zählt als Auftragszeit (Zeiterfassungsgrad, KF3-35)
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setKatDialog(null)}>Abbrechen</Button>
              <Button type="submit">Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!katDelete}
        onOpenChange={(o) => { if (!o) setKatDelete(null); }}
        title="Kategorie löschen?"
        description="Die Zeitkategorie wird entfernt. Buchungen mit dieser Kategorie behalten ihre Daten, verlieren aber die Zuordnung."
        confirmLabel="Löschen"
        onConfirm={deleteKat}
      />

      {/* ───────── Dialoge: Benutzer ───────── */}
      <Dialog open={beCreate} onOpenChange={setBeCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuer Benutzer</DialogTitle>
            <DialogDescription>Ohne Passwort wird ein zufälliges Initialpasswort erzeugt und nach dem Anlegen angezeigt (muss beim ersten Login geändert werden).</DialogDescription>
          </DialogHeader>
          <form onSubmit={createBenutzer} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Benutzername *</Label>
              <Input required value={beForm.username} onChange={(e) => setBeForm({ ...beForm, username: e.target.value })} />
              {beErrors.username && <p className="text-destructive text-xs">{beErrors.username}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={beForm.name} onChange={(e) => setBeForm({ ...beForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Rolle</Label>
              <Select value={beForm.rolle} onValueChange={(v) => setBeForm({ ...beForm, rolle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLLEN.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Passwort (optional)</Label>
              <Input type="password" value={beForm.passwort} onChange={(e) => setBeForm({ ...beForm, passwort: e.target.value })} />
              {beErrors.passwort && <p className="text-destructive text-xs">{beErrors.passwort}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBeCreate(false)}>Abbrechen</Button>
              <Button type="submit">Anlegen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!beEdit} onOpenChange={(o) => { if (!o) setBeEdit(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Benutzer bearbeiten</DialogTitle></DialogHeader>
          {beEdit && (
            <form onSubmit={saveBenutzer} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={beEdit.name ?? ""} onChange={(e) => setBeEdit({ ...beEdit, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rolle</Label>
                  <Select value={beEdit.rolle} onValueChange={(v) => setBeEdit({ ...beEdit, rolle: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLLEN.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-2">
                  <Checkbox id="be-aktiv" checked={beEdit.aktiv} onCheckedChange={(c) => setBeEdit({ ...beEdit, aktiv: !!c })} />
                  <Label htmlFor="be-aktiv">Aktiv</Label>
                </div>
              </div>

              {beEdit.rolle === "admin" ? (
                <p className="text-sm text-muted-foreground rounded-md border p-3">
                  Administratoren haben automatisch alle Rechte.
                </p>
              ) : (
                <div className="space-y-2">
                  <Label>Rechte</Label>
                  <div className="rounded-md border divide-y">
                    {katalog.map((g) => (
                      <div key={g.key} className="p-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`r-${g.key}`}
                            checked={beRechte.has(g.key)}
                            onCheckedChange={(c) => toggleRecht(g.key, !!c)}
                          />
                          <Label htmlFor={`r-${g.key}`} className="font-medium">{g.label}</Label>
                        </div>
                        {g.funktionen.length > 0 && (
                          <div className="ml-6 space-y-1">
                            {g.funktionen.map((fn) => (
                              <div key={fn.key} className="flex items-center gap-2">
                                <Checkbox
                                  id={`r-${fn.key}`}
                                  checked={beRechte.has(fn.key)}
                                  onCheckedChange={(c) => toggleRecht(fn.key, !!c)}
                                />
                                <Label htmlFor={`r-${fn.key}`} className="text-sm font-normal text-muted-foreground">{fn.label}</Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setBeEdit(null)}>Abbrechen</Button>
                <Button type="submit">Speichern</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!beReset}
        onOpenChange={(o) => { if (!o) setBeReset(null); }}
        title="Passwort zurücksetzen?"
        description={`Das Passwort von "${beReset?.username}" wird auf ein neues Zufalls-Initialpasswort gesetzt und danach angezeigt. Der Benutzer muss es beim nächsten Login ändern.`}
        confirmLabel="Zurücksetzen"
        destructive={false}
        onConfirm={resetBenutzer}
      />

      <ConfirmDialog
        open={!!beDelete}
        onOpenChange={(o) => { if (!o) setBeDelete(null); }}
        title="Benutzer löschen?"
        description={`Das Konto "${beDelete?.username}" wird dauerhaft entfernt.`}
        confirmLabel="Löschen"
        onConfirm={deleteBenutzer}
      />
    </div>
  );
}
