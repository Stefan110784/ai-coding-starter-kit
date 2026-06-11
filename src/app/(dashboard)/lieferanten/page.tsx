"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, Calculator, Trash2, Link2, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LieferantBewertungBlock, PreisHistorieDialog } from "@/components/einkauf/lieferant-bewertung";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ArtikelLink {
  id: string;
  artikelnummer: string;
  einkaufspreis: string | number;
  mindestmenge: number;
  bestellkosten?: string | number | null;
  lagerkostensatz?: string | number | null;
  jahresbedarf?: number | null;
  artikel: { artikelnummer: string; bezeichnung: string; einheit: string };
}

/** Wilson-Formel, wenn alle EOQ-Parameter am Link gepflegt sind. */
function eoqAusLink(l: ArtikelLink): number | null {
  const d = Number(l.jahresbedarf);
  const s = Number(l.bestellkosten);
  const h = Number(l.lagerkostensatz);
  if (!d || !s || !h) return null;
  return Math.round(Math.sqrt((2 * d * s) / h));
}

/** Verknüpfte Artikel eines Lieferanten verwalten (Material-Bezug des Reiters). */
function LieferantDetail({ lieferantId, istAdmin }: { lieferantId: string; istAdmin: boolean }) {
  const key = `/api/lieferanten/${lieferantId}`;
  const { data, isLoading } = useSWR(key, fetcher);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    artikelnummer: "", einkaufspreis: "", mindestmenge: "1",
    bestellkosten: "", lagerkostensatz: "", jahresbedarf: "",
  });
  const [loeschLink, setLoeschLink] = useState<ArtikelLink | null>(null);
  const [historieLink, setHistorieLink] = useState<ArtikelLink | null>(null);
  const { data: vorschlaege } = useSWR(
    showAdd && addForm.artikelnummer.length >= 2
      ? `/api/artikel?q=${encodeURIComponent(addForm.artikelnummer)}`
      : null,
    fetcher
  );

  async function verknuepfen(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`${key}/artikel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artikelnummer: addForm.artikelnummer.trim(),
        einkaufspreis: parseFloat(addForm.einkaufspreis),
        mindestmenge: addForm.mindestmenge ? parseFloat(addForm.mindestmenge) : 1,
        bestellkosten: addForm.bestellkosten ? parseFloat(addForm.bestellkosten) : null,
        lagerkostensatz: addForm.lagerkostensatz ? parseFloat(addForm.lagerkostensatz) : null,
        jahresbedarf: addForm.jahresbedarf ? parseFloat(addForm.jahresbedarf) : null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Verknüpfen fehlgeschlagen"); return; }
    toast.success("Artikel verknüpft");
    setShowAdd(false);
    setAddForm({ artikelnummer: "", einkaufspreis: "", mindestmenge: "1", bestellkosten: "", lagerkostensatz: "", jahresbedarf: "" });
    mutate(key);
    mutate("/api/lieferanten");
  }

  async function entfernen() {
    if (!loeschLink) return;
    const res = await fetch(`${key}/artikel/${loeschLink.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Entfernen fehlgeschlagen"); return; }
    toast.success("Verknüpfung entfernt");
    setLoeschLink(null);
    mutate(key);
    mutate("/api/lieferanten");
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-2 pt-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
      </div>
    );
  }

  const links: ArtikelLink[] = Array.isArray(data.artikel) ? data.artikel : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">Kontakt</span>
        <span>{data.kontakt ?? "–"}</span>
        <span className="text-muted-foreground">E-Mail</span>
        <span>{data.email ?? "–"}</span>
        <span className="text-muted-foreground">Telefon</span>
        <span>{data.telefon ?? "–"}</span>
        <span className="text-muted-foreground">Lieferzeit</span>
        <span>{data.lieferzeitTage} Tage</span>
      </div>

      {/* Automatische Bewertung aus Wareneingängen + Eingangsprüfungen (KF3-32) */}
      <div className="mt-3">
        <LieferantBewertungBlock lieferantId={lieferantId} />
      </div>

      <Separator className="my-3" />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Artikel ({links.length})</h3>
        {istAdmin && !showAdd && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Link2 className="size-3 mr-1" /> Artikel verknüpfen
          </Button>
        )}
      </div>

      {showAdd && (
        <form onSubmit={verknuepfen} className="mt-2 space-y-2 rounded border p-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Artikel *</Label>
            <Input
              required
              list="lieferant-artikel-vorschlaege"
              placeholder="Artikelnummer…"
              value={addForm.artikelnummer}
              onChange={(e) => setAddForm({ ...addForm, artikelnummer: e.target.value })}
            />
            <datalist id="lieferant-artikel-vorschlaege">
              {(Array.isArray(vorschlaege) ? vorschlaege : []).slice(0, 50).map(
                (a: { artikelnummer: string; bezeichnung: string }) => (
                  <option key={a.artikelnummer} value={a.artikelnummer}>{a.bezeichnung}</option>
                )
              )}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Einkaufspreis (€) *</Label>
              <Input required type="number" min="0" step="any" value={addForm.einkaufspreis}
                onChange={(e) => setAddForm({ ...addForm, einkaufspreis: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mindestmenge</Label>
              <Input type="number" min="0.001" step="any" value={addForm.mindestmenge}
                onChange={(e) => setAddForm({ ...addForm, mindestmenge: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Optional für EOQ-Berechnung. Lagerkosten = absoluter €-Betrag je Stück und Jahr (≈ Einkaufspreis × Lagerzinssatz), kein Prozentsatz.</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Jahresbedarf</Label>
              <Input type="number" min="0" step="any" value={addForm.jahresbedarf}
                onChange={(e) => setAddForm({ ...addForm, jahresbedarf: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bestellkosten €</Label>
              <Input type="number" min="0" step="any" value={addForm.bestellkosten}
                onChange={(e) => setAddForm({ ...addForm, bestellkosten: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lagerkosten €/Stk/Jahr</Label>
              <Input type="number" min="0" step="any" value={addForm.lagerkostensatz}
                onChange={(e) => setAddForm({ ...addForm, lagerkostensatz: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">Verknüpfen</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowAdd(false)}>Abbrechen</Button>
          </div>
        </form>
      )}

      {links.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Noch keine Artikel verknüpft{istAdmin ? " — über „Artikel verknüpfen“ Material und Konditionen zuordnen." : "."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artikel</TableHead>
              <TableHead className="text-right">Preis</TableHead>
              <TableHead className="text-right">Min.</TableHead>
              <TableHead className="text-right">EOQ</TableHead>
              {istAdmin && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((l) => {
              const eoq = eoqAusLink(l);
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-mono text-xs">{l.artikel.artikelnummer}</div>
                    <div className="text-xs text-muted-foreground">{l.artikel.bezeichnung}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(l.einkaufspreis).toFixed(2)} €
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{l.mindestmenge}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {eoq != null ? `${eoq} Stk` : "–"}
                  </TableCell>
                  {istAdmin && (
                    <TableCell>
                      <div className="flex">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          onClick={() => setHistorieLink(l)}
                          aria-label="Preisverlauf"
                          title="Preisverlauf"
                        >
                          <History className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6 text-destructive"
                          onClick={() => setLoeschLink(l)}
                          aria-label="Verknüpfung entfernen"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={!!loeschLink}
        onOpenChange={(o) => { if (!o) setLoeschLink(null); }}
        title="Verknüpfung entfernen?"
        description={`Die Zuordnung von "${loeschLink?.artikel.artikelnummer}" zu diesem Lieferanten wird entfernt. Der Artikel selbst bleibt erhalten.`}
        confirmLabel="Entfernen"
        onConfirm={entfernen}
      />

      <PreisHistorieDialog
        link={historieLink ? { id: historieLink.id, artikelnummer: historieLink.artikel.artikelnummer } : null}
        lieferantId={lieferantId}
        open={!!historieLink}
        onOpenChange={(o) => { if (!o) setHistorieLink(null); }}
      />
    </>
  );
}

export default function LieferantenPage() {
  const { me } = useMe();
  const istAdmin = me?.rolle === "admin";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEOQ, setShowEOQ] = useState(false);
  const [form, setForm] = useState({ name: "", kontakt: "", email: "", telefon: "", lieferzeitTage: "7" });
  const [eoqForm, setEoqForm] = useState({ jahresbedarf: "", bestellkosten: "", lagerkostensatz: "", lieferzeitTage: "7", einkaufspreis: "", lagerzinssatz: "" });
  const [eoqResult, setEoqResult] = useState<{
    eoq: number;
    bestellpunkt: number;
    jahreskostenOptimal: number;
    anzahlBestellungen: number;
    bestellintervallTage: number;
  } | null>(null);

  const { data, isLoading } = useSWR("/api/lieferanten", fetcher);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/lieferanten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, lieferzeitTage: parseInt(form.lieferzeitTage) }),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Fehler"); return; }
    toast.success("Lieferant angelegt");
    setShowCreate(false);
    setForm({ name: "", kontakt: "", email: "", telefon: "", lieferzeitTage: "7" });
    mutate("/api/lieferanten");
  }

  async function handleEOQ(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/lieferanten/eoq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jahresbedarf: parseFloat(eoqForm.jahresbedarf),
        bestellkosten: parseFloat(eoqForm.bestellkosten),
        lagerkostensatz: parseFloat(eoqForm.lagerkostensatz),
        lieferzeitTage: parseInt(eoqForm.lieferzeitTage),
      }),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Fehler"); return; }
    setEoqResult(body);
  }

  // Andler-Herleitung: H = Einkaufspreis × Lagerzinssatz%. Befüllt das H-Feld
  // automatisch, sobald Preis und Zinssatz gesetzt sind (H bleibt editierbar).
  function setAndlerFeld(feld: "einkaufspreis" | "lagerzinssatz", wert: string) {
    setEoqForm((f) => {
      const next = { ...f, [feld]: wert };
      const p = parseFloat(next.einkaufspreis);
      const z = parseFloat(next.lagerzinssatz);
      if (p > 0 && z > 0) {
        next.lagerkostensatz = (Math.round(p * (z / 100) * 100) / 100).toString();
      }
      return next;
    });
  }

  const lieferanten = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lieferanten & EOQ</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowEOQ(true)}>
            <Calculator className="size-4 mr-2" />
            EOQ-Rechner
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-2" />
            Neuer Lieferant
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kontakt</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead className="text-right">Lieferzeit (Tage)</TableHead>
                <TableHead className="text-right">Artikel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? [...Array(4)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : lieferanten.map((l: {
                    id: string;
                    name: string;
                    kontakt?: string;
                    email?: string;
                    telefon?: string;
                    lieferzeitTage: number;
                    artikel: unknown[];
                  }) => (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedId(l.id)}
                    >
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>{l.kontakt ?? "–"}</TableCell>
                      <TableCell>{l.email ?? "–"}</TableCell>
                      <TableCell>{l.telefon ?? "–"}</TableCell>
                      <TableCell className="text-right">{l.lieferzeitTage}</TableCell>
                      <TableCell className="text-right">{l.artikel.length}</TableCell>
                    </TableRow>
                  ))}
              {!isLoading && lieferanten.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Noch keine Lieferanten angelegt
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Lieferant-Detail mit Artikel-Verknüpfungen ── */}
      <Sheet open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle>
              {lieferanten.find((l: { id: string; name: string }) => l.id === selectedId)?.name ?? "Lieferant"}
            </SheetTitle>
          </SheetHeader>
          {selectedId && <LieferantDetail lieferantId={selectedId} istAdmin={istAdmin} />}
        </SheetContent>
      </Sheet>

      {/* Neuer Lieferant */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neuer Lieferant</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kontaktperson</Label>
                <Input value={form.kontakt} onChange={(e) => setForm({ ...form, kontakt: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Lieferzeit (Tage)</Label>
                <Input type="number" min="0" value={form.lieferzeitTage} onChange={(e) => setForm({ ...form, lieferzeitTage: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>E-Mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
              <Button type="submit">Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EOQ-Rechner */}
      <Dialog open={showEOQ} onOpenChange={setShowEOQ}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>EOQ-Rechner (Wilson-Formel)</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEOQ} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Optimale Bestellmenge = √(2 × D × S / H). H = absolute Lagerkosten
              je Stück und Jahr (≈ Einkaufspreis × Lagerzinssatz), kein Prozentsatz.
            </p>
            <div className="space-y-1.5">
              <Label>D – Jahresbedarf (Stk/Jahr) *</Label>
              <Input required type="number" min="1" step="any" value={eoqForm.jahresbedarf} onChange={(e) => setEoqForm({ ...eoqForm, jahresbedarf: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>S – Bestellkosten (€/Bestellung) *</Label>
              <Input required type="number" min="0.01" step="any" value={eoqForm.bestellkosten} onChange={(e) => setEoqForm({ ...eoqForm, bestellkosten: e.target.value })} />
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Optional: H nach Andler aus Preis × Zinssatz berechnen</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Einkaufspreis (€/Stk)</Label>
                  <Input type="number" min="0" step="any" value={eoqForm.einkaufspreis} onChange={(e) => setAndlerFeld("einkaufspreis", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Lagerzinssatz (%/Jahr)</Label>
                  <Input type="number" min="0" step="any" value={eoqForm.lagerzinssatz} onChange={(e) => setAndlerFeld("lagerzinssatz", e.target.value)} />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>H – Lagerkosten (€/Stk/Jahr) *</Label>
              <Input required type="number" min="0.01" step="any" value={eoqForm.lagerkostensatz} onChange={(e) => setEoqForm({ ...eoqForm, lagerkostensatz: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Lieferzeit (Tage)</Label>
              <Input type="number" min="0" value={eoqForm.lieferzeitTage} onChange={(e) => setEoqForm({ ...eoqForm, lieferzeitTage: e.target.value })} />
            </div>
            <Button type="submit" className="w-full">Berechnen</Button>
          </form>

          {eoqResult && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-muted-foreground text-xs">Optimale Bestellmenge</p>
                  <p className="text-2xl font-bold">{eoqResult.eoq} Stk</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-muted-foreground text-xs">Bestellpunkt</p>
                  <p className="text-2xl font-bold">{eoqResult.bestellpunkt} Stk</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-muted-foreground text-xs">Bestellungen/Jahr</p>
                  <p className="text-xl font-bold">{eoqResult.anzahlBestellungen}×</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-muted-foreground text-xs">Bestellintervall</p>
                  <p className="text-xl font-bold">{eoqResult.bestellintervallTage} Tage</p>
                </div>
                <div className="rounded-lg bg-muted p-3 col-span-2">
                  <p className="text-muted-foreground text-xs">Optimale Jahresgesamtkosten</p>
                  <p className="text-xl font-bold">{eoqResult.jahreskostenOptimal.toFixed(2)} €</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
