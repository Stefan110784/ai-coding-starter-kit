"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Search, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ConfirmDialog } from "@/components/confirm-dialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface InventurArtikel {
  artikelnummer: string;
  bezeichnung: string;
  einheit: string;
  bestand: number;
  zuletztGezaehltAm?: string | null;
  lagerplatz?: string | null;
}

interface ArtikelDetail extends InventurArtikel {
  lagerorte: Array<{ lagerortId: string; name: string; bestand: number }>;
}

interface Zaehlung {
  id: string;
  artikelnummer: string;
  sollMenge: number;
  istMenge?: number | null;
  differenz: number;
  notiz?: string | null;
  erfasstAm: string;
  artikel?: { bezeichnung: string; einheit: string } | null;
  erfasstVon?: { username: string; name?: string | null } | null;
}

function fmtDatum(dt?: string | null) {
  if (!dt) return "noch nie";
  return new Date(dt).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const ZAEHLUNGEN_KEY = "/api/inventur/zaehlungen?status=erfasst";

/** Rollierende Inventur: Artikel suchen → zählen → Differenz buchen (V2: inventur.js). */
export function InventurTab() {
  const [suche, setSuche] = useState("");
  const [sucheDebounced, setSucheDebounced] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [istMenge, setIstMenge] = useState("");
  const [notiz, setNotiz] = useState("");
  const [offeneZaehlung, setOffeneZaehlung] = useState<Zaehlung | null>(null);
  const [buchLagerortId, setBuchLagerortId] = useState("");
  const [verwerfeId, setVerwerfeId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSucheDebounced(suche), 250);
    return () => clearTimeout(t);
  }, [suche]);

  const { data: artikel, isLoading: artikelLoading } = useSWR(
    `/api/inventur/artikel?suche=${encodeURIComponent(sucheDebounced)}`, fetcher
  );
  const { data: detail } = useSWR<ArtikelDetail>(
    gewaehlt ? `/api/inventur/artikel/${encodeURIComponent(gewaehlt)}` : null, fetcher
  );
  const { data: zaehlungen } = useSWR(ZAEHLUNGEN_KEY, fetcher, { refreshInterval: 30000 });

  // Default-Lagerort: der mit dem höchsten Bestand — Vorbelegung, sobald die
  // Daten eingetroffen sind (bewusst setState im Effect; einmalig durch Guard)
  useEffect(() => {
    if (offeneZaehlung && detail?.lagerorte?.length && !buchLagerortId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBuchLagerortId(detail.lagerorte[0].lagerortId);
    }
  }, [offeneZaehlung, detail, buchLagerortId]);
  const { data: alleLagerorte } = useSWR(offeneZaehlung ? "/api/material/lagerorte" : null, fetcher);

  function artikelWaehlen(nr: string | null) {
    setGewaehlt(nr);
    setOffeneZaehlung(null);
    setIstMenge("");
    setNotiz("");
    setBuchLagerortId("");
  }

  async function zaehlungSpeichern(e: React.FormEvent) {
    e.preventDefault();
    if (!gewaehlt) return;
    const res = await fetch("/api/inventur/zaehlung", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artikelnummer: gewaehlt,
        istMenge: parseFloat(istMenge),
        ...(notiz ? { notiz } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Fehler beim Erfassen"); return; }
    setOffeneZaehlung(body);
    mutate(ZAEHLUNGEN_KEY);
  }

  async function buchen(zaehlung: Zaehlung) {
    if (!buchLagerortId) { toast.error("Bitte Lagerort wählen"); return; }
    const res = await fetch(`/api/inventur/zaehlung/${zaehlung.id}/buchen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lagerortId: buchLagerortId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Buchen fehlgeschlagen"); return; }
    if (body.warnung != null) {
      toast.warning(`Bestand hat sich seit dem Zählen um ${body.warnung} geändert — Differenz wurde gegen das aktuelle Soll gebucht.`);
    }
    toast.success(`Gebucht — neuer Bestand: ${body.neuerBestand}`);
    setOffeneZaehlung(null);
    setIstMenge("");
    setNotiz("");
    mutate(ZAEHLUNGEN_KEY);
    mutate((key) => typeof key === "string" && key.startsWith("/api/material/bewegungen"));
    mutate("/api/material/bestaende");
    if (gewaehlt) mutate(`/api/inventur/artikel/${encodeURIComponent(gewaehlt)}`);
    mutate((key) => typeof key === "string" && key.startsWith("/api/inventur/artikel?"));
  }

  async function verwerfen() {
    if (!verwerfeId) return;
    const res = await fetch(`/api/inventur/zaehlung/${verwerfeId}/verwerfen`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Verwerfen fehlgeschlagen"); return; }
    toast.success("Zählung verworfen");
    if (offeneZaehlung?.id === verwerfeId) setOffeneZaehlung(null);
    setVerwerfeId(null);
    mutate(ZAEHLUNGEN_KEY);
  }

  function zaehlungOeffnen(z: Zaehlung) {
    artikelWaehlen(z.artikelnummer);
    setOffeneZaehlung(z);
  }

  const artikelListe: InventurArtikel[] = Array.isArray(artikel) ? artikel : [];
  const offeneListe: Zaehlung[] = Array.isArray(zaehlungen) ? zaehlungen : [];
  const differenz = offeneZaehlung ? (offeneZaehlung.istMenge ?? 0) - offeneZaehlung.sollMenge : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Artikel-Suche ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Artikel zählen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Artikelnummer oder Bezeichnung…"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {artikelLoading
              ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
              : artikelListe.map((a) => (
                  <button
                    key={a.artikelnummer}
                    className={`flex w-full items-center justify-between gap-2 rounded border p-2 text-left text-sm hover:bg-muted/50 ${gewaehlt === a.artikelnummer ? "border-primary" : ""}`}
                    onClick={() => artikelWaehlen(a.artikelnummer)}
                  >
                    <span>
                      <span className="font-mono text-xs">{a.artikelnummer}</span>
                      <span className="block text-xs text-muted-foreground">{a.bezeichnung}</span>
                    </span>
                    <span className="text-right text-xs">
                      <span className="font-mono">{a.bestand} {a.einheit}</span>
                      {a.lagerplatz && <Badge variant="outline" className="ml-1 text-[10px]">{a.lagerplatz}</Badge>}
                      <span className="block text-muted-foreground">Gezählt: {fmtDatum(a.zuletztGezaehltAm)}</span>
                    </span>
                  </button>
                ))}
            {!artikelLoading && artikelListe.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Keine Artikel gefunden</p>
            )}
          </div>

          {/* ── Zähl-/Buch-Panel ──────────────────────────── */}
          {gewaehlt && detail && !offeneZaehlung && (
            <form onSubmit={zaehlungSpeichern} className="space-y-2 rounded border p-3">
              <div className="text-sm">
                <span className="font-mono text-xs">{detail.artikelnummer}</span> — {detail.bezeichnung}
                <span className="block text-xs text-muted-foreground">
                  Aktueller Bestand (Soll): <strong>{detail.bestand} {detail.einheit}</strong>
                  {detail.lagerplatz ? ` · Lagerplatz ${detail.lagerplatz}` : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Gezählte Menge *</Label>
                  <Input required type="number" min="0" step="any" inputMode="decimal"
                    value={istMenge} onChange={(e) => setIstMenge(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notiz</Label>
                  <Input value={notiz} onChange={(e) => setNotiz(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  <ClipboardCheck className="size-3 mr-1" /> Zählung speichern
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => artikelWaehlen(null)}>
                  Abbrechen
                </Button>
              </div>
            </form>
          )}

          {offeneZaehlung && (
            <div className="space-y-2 rounded border p-3">
              <div className="text-sm font-medium">Zählung buchen — {offeneZaehlung.artikelnummer}</div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded bg-muted p-2">
                  <div className="text-xs text-muted-foreground">Soll</div>
                  <div className="font-mono">{offeneZaehlung.sollMenge}</div>
                </div>
                <div className="rounded bg-muted p-2">
                  <div className="text-xs text-muted-foreground">Ist</div>
                  <div className="font-mono">{offeneZaehlung.istMenge}</div>
                </div>
                <div className="rounded bg-muted p-2">
                  <div className="text-xs text-muted-foreground">Differenz</div>
                  <div className={`font-mono font-semibold ${differenz === 0 ? "text-green-600" : "text-destructive"}`}>
                    {differenz > 0 ? `+${differenz}` : differenz}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lagerort für die Korrektur</Label>
                <Select value={buchLagerortId} onValueChange={setBuchLagerortId}>
                  <SelectTrigger><SelectValue placeholder="Lagerort wählen…" /></SelectTrigger>
                  <SelectContent>
                    {(detail?.lagerorte ?? []).map((l) => (
                      <SelectItem key={l.lagerortId} value={l.lagerortId}>
                        {l.name} (Bestand {l.bestand})
                      </SelectItem>
                    ))}
                    {(Array.isArray(alleLagerorte) ? alleLagerorte : [])
                      .filter((l: { id: string }) => !(detail?.lagerorte ?? []).some((d) => d.lagerortId === l.id))
                      .map((l: { id: string; name: string }) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => buchen(offeneZaehlung)}>
                  {differenz === 0 ? "Als geprüft buchen" : "Differenz buchen"}
                </Button>
                <Button size="sm" variant="outline" className="text-destructive"
                  onClick={() => setVerwerfeId(offeneZaehlung.id)}>
                  Verwerfen
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Offene Zählungen ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Offene Zählungen ({offeneListe.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {offeneListe.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Keine offenen Zählungen</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artikel</TableHead>
                  <TableHead className="text-right">Soll</TableHead>
                  <TableHead className="text-right">Ist</TableHead>
                  <TableHead className="text-right">Diff.</TableHead>
                  <TableHead>Erfasst</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {offeneListe.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{z.artikelnummer}</div>
                      <div className="text-xs text-muted-foreground">{z.artikel?.bezeichnung}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{z.sollMenge}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{z.istMenge}</TableCell>
                    <TableCell className={`text-right font-mono text-xs ${z.differenz === 0 ? "" : "text-destructive"}`}>
                      {z.differenz > 0 ? `+${z.differenz}` : z.differenz}
                    </TableCell>
                    <TableCell className="text-xs">
                      {fmtDatum(z.erfasstAm)}
                      <span className="block text-muted-foreground">
                        {z.erfasstVon?.name ?? z.erfasstVon?.username ?? "–"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => zaehlungOeffnen(z)}>
                        Buchen →
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!verwerfeId}
        onOpenChange={(o) => { if (!o) setVerwerfeId(null); }}
        title="Zählung verwerfen?"
        description="Die erfasste Zählung wird verworfen, es wird nichts gebucht."
        confirmLabel="Verwerfen"
        onConfirm={verwerfen}
      />
    </div>
  );
}
