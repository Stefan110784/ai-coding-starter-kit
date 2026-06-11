"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ParetoBlock } from "@/components/pareto-block";
import { FuenfsErinnerung } from "@/components/fuenfs-erinnerung";
import { FUENFS_KATEGORIE_LABEL } from "@/lib/fuenfs";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Bereich {
  id: string;
  name: string;
  aktiv: boolean;
  verantwortlich?: { id: string; name: string; kuerzel: string } | null;
}

interface AuditRow {
  id: string;
  monat: string;
  status: string;
  scoreProzent: number | null;
  bereich: { id: string; name: string };
  erstelltVon?: { username: string; name?: string | null } | null;
}

const CHART_FARBEN = ["#2563eb", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6", "#0891b2"];

/** 5S (Anforderung Kap. 5; KF3-36): Audits, Trend, Pareto, Maßnahmen, Standards. */
export default function FuenfsPage() {
  const router = useRouter();
  const { hatRecht } = useMe();
  const darfAudit = hatRecht("fuenfs.audit");
  const darfVerwalten = hatRecht("verwaltung");

  const { data: bereicheData } = useSWR<Bereich[]>("/api/fuenfs/bereiche", fetcher);
  const { data: auditsData, isLoading } = useSWR<AuditRow[]>("/api/fuenfs/audits", fetcher);
  const { data: trendData } = useSWR<{ bereiche: Array<{ id: string; name: string }>; punkte: Array<Record<string, unknown>> }>(
    "/api/fuenfs/trend?monate=12",
    fetcher
  );
  const { data: massnahmenData } = useSWR<Array<{
    id: string; beschreibung: string; status: string; faelligAm?: string | null;
    verantwortlich?: { kuerzel: string } | null; grund?: { name: string } | null;
  }>>("/api/abweichungen?typ=fuenfs", fetcher);

  const bereiche = Array.isArray(bereicheData) ? bereicheData : [];
  const audits = Array.isArray(auditsData) ? auditsData : [];
  const massnahmen = Array.isArray(massnahmenData) ? massnahmenData : [];

  const [startOffen, setStartOffen] = useState(false);
  const [startBereich, setStartBereich] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function auditStarten() {
    setLaeuft(true);
    try {
      const res = await fetch("/api/fuenfs/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bereichId: startBereich }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Audit konnte nicht gestartet werden");
        return;
      }
      setStartOffen(false);
      router.push(`/fuenfs/audit/${body.id}`);
    } finally {
      setLaeuft(false);
    }
  }

  async function massnahmeStatus(id: string, status: string) {
    const res = await fetch(`/api/abweichungen/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Statusänderung fehlgeschlagen");
      return;
    }
    mutate("/api/abweichungen?typ=fuenfs");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">5S</h1>
        {darfAudit && (
          <Button onClick={() => setStartOffen(true)} disabled={bereiche.length === 0}>
            <Plus className="size-4 mr-1" /> Audit starten
          </Button>
        )}
      </div>

      <FuenfsErinnerung />

      <Tabs defaultValue="audits">
        <TabsList className="flex-wrap">
          <TabsTrigger value="audits">Audits</TabsTrigger>
          <TabsTrigger value="trend">Trend</TabsTrigger>
          <TabsTrigger value="pareto">Pareto</TabsTrigger>
          <TabsTrigger value="massnahmen">Maßnahmen ({massnahmen.filter((m) => m.status !== "abgeschlossen").length})</TabsTrigger>
          <TabsTrigger value="standards">Standards</TabsTrigger>
          {darfVerwalten && <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>}
        </TabsList>

        {/* ── Audits ── */}
        <TabsContent value="audits" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : audits.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Noch keine Audits. {bereiche.length === 0 && "Zuerst unter Stammdaten einen Bereich anlegen."}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bereich</TableHead>
                      <TableHead>Monat</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Auditor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audits.map((a) => (
                      <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/fuenfs/audit/${a.id}`)}>
                        <TableCell>{a.bereich.name}</TableCell>
                        <TableCell className="font-mono text-sm">{a.monat.slice(5)}/{a.monat.slice(0, 4)}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "abgeschlossen" ? "outline" : "secondary"}>
                            {a.status === "abgeschlossen" ? "abgeschlossen" : "Entwurf"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {a.scoreProzent != null ? `${a.scoreProzent} %` : "–"}
                        </TableCell>
                        <TableCell className="text-sm">{a.erstelltVon?.name || a.erstelltVon?.username || "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Trend ── */}
        <TabsContent value="trend" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {!trendData || trendData.bereiche?.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Noch keine abgeschlossenen Audits — der Trend entsteht ab dem ersten Abschluss.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData.punkte}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} unit=" %" tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    {trendData.bereiche.map((b, i) => (
                      <Line
                        key={b.id}
                        dataKey={b.name}
                        stroke={CHART_FARBEN[i % CHART_FARBEN.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pareto ── */}
        <TabsContent value="pareto" className="mt-4">
          <ParetoBlock initialAbwTyp="fuenfs" />
        </TabsContent>

        {/* ── Maßnahmen ── */}
        <TabsContent value="massnahmen" className="mt-4">
          {massnahmen.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Keine 5S-Maßnahmen.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Grund</TableHead>
                      <TableHead>Verantwortlich</TableHead>
                      <TableHead>Fällig</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {massnahmen.map((m) => {
                      // Tagesvergleich Europe/Berlin (Konvention KF3-27): am
                      // Fälligkeitstag selbst ist die Maßnahme nicht überfällig
                      const heuteTag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
                      const ueberfaellig =
                        m.status !== "abgeschlossen" &&
                        m.faelligAm &&
                        new Date(m.faelligAm).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) < heuteTag;
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="max-w-md text-sm">{m.beschreibung}</TableCell>
                          <TableCell className="text-sm">{m.grund?.name ?? "–"}</TableCell>
                          <TableCell className="text-sm">{m.verantwortlich?.kuerzel ?? "–"}</TableCell>
                          <TableCell className="text-sm">
                            {m.faelligAm ? new Date(m.faelligAm).toLocaleDateString("de-DE") : "–"}
                            {ueberfaellig && <Badge variant="destructive" className="ml-2 text-[10px]">überfällig</Badge>}
                          </TableCell>
                          <TableCell>
                            {darfAudit ? (
                              <Select value={m.status} onValueChange={(v) => massnahmeStatus(m.id, v)}>
                                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="offen">Offen</SelectItem>
                                  <SelectItem value="inBearbeitung">In Bearbeitung</SelectItem>
                                  <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="secondary">{m.status}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Standards (Seiketsu) ── */}
        <TabsContent value="standards" className="mt-4 space-y-4">
          {bereiche.map((b) => (
            <StandardGalerie key={b.id} bereich={b} darfAudit={darfAudit} />
          ))}
          {bereiche.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Keine Bereiche.</CardContent></Card>
          )}
        </TabsContent>

        {/* ── Stammdaten (Recht verwaltung) ── */}
        {darfVerwalten && (
          <TabsContent value="stammdaten" className="mt-4">
            <FuenfsStammdaten />
          </TabsContent>
        )}
      </Tabs>

      {/* Audit-Start-Dialog */}
      <Dialog open={startOffen} onOpenChange={setStartOffen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>5S-Audit starten</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Bereich *</Label>
            <Select value={startBereich} onValueChange={setStartBereich}>
              <SelectTrigger><SelectValue placeholder="Bereich wählen…" /></SelectTrigger>
              <SelectContent>
                {bereiche.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Monat: aktueller Kalendermonat — genau ein Audit je Bereich und Monat.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOffen(false)}>Abbrechen</Button>
            <Button disabled={!startBereich || laeuft} onClick={auditStarten}>Starten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Soll-Zustand-Galerie eines Bereichs — append-only (neuestes = Standard). */
function StandardGalerie({ bereich, darfAudit }: { bereich: Bereich; darfAudit: boolean }) {
  const key = `/api/fuenfs/bereiche/${bereich.id}/standards`;
  const { data } = useSWR<Array<{ id: string; name: string; hinzugefuegt: string }>>(key, fetcher);
  const fotos = Array.isArray(data) ? data : [];

  async function hochladen(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(key, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Upload fehlgeschlagen");
      return;
    }
    toast.success("Standard-Foto gespeichert");
    mutate(key);
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{bereich.name}</h3>
          <span className="flex-1" />
          {darfAudit && (
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) hochladen(f);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="outline" asChild>
                <span className="cursor-pointer"><Upload className="size-4 mr-1" /> Neuer Standard</span>
              </Button>
            </label>
          )}
        </div>
        {fotos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch kein Soll-Zustand-Foto.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            {fotos.map((f, i) => (
              <a key={f.id} href={`/api/fotos/${f.id}`} target="_blank" rel="noreferrer" className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/fotos/${f.id}`}
                  alt={f.name}
                  className={`rounded object-cover ${i === 0 ? "h-32 w-32 ring-2 ring-primary" : "h-16 w-16 opacity-70"}`}
                />
                {i === 0 && <p className="text-[10px] text-muted-foreground">gültiger Standard</p>}
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Bereiche + Checklisten-Vorlage pflegen (Recht verwaltung). */
function FuenfsStammdaten() {
  const { data: bereicheData } = useSWR<Bereich[]>("/api/fuenfs/bereiche?alle=1", fetcher);
  const { data: punkteData } = useSWR<Array<{ id: string; kategorie: string; text: string; aktiv: boolean; sortorder: number }>>(
    "/api/fuenfs/checkliste?alle=1",
    fetcher
  );
  const { data: mitarbeiter } = useSWR<Array<{ id: string; name: string }>>("/api/mitarbeiter", fetcher);

  const bereiche = Array.isArray(bereicheData) ? bereicheData : [];
  const punkte = Array.isArray(punkteData) ? punkteData : [];

  const [neuBereich, setNeuBereich] = useState("");
  const [neuPunkt, setNeuPunkt] = useState({ kategorie: "seiri", text: "" });

  async function api(url: string, method: string, payload: Record<string, unknown>, erfolg: string) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Fehler");
      return false;
    }
    toast.success(erfolg);
    mutate((k) => typeof k === "string" && k.startsWith("/api/fuenfs"));
    return true;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 py-3">
          <h3 className="text-sm font-semibold">Bereiche</h3>
          <div className="flex gap-2">
            <Input value={neuBereich} onChange={(e) => setNeuBereich(e.target.value)} placeholder="z. B. Montage" className="h-9" />
            <Button
              size="sm"
              disabled={!neuBereich.trim()}
              onClick={async () => {
                if (await api("/api/fuenfs/bereiche", "POST", { name: neuBereich.trim() }, "Bereich angelegt")) setNeuBereich("");
              }}
            >
              Anlegen
            </Button>
          </div>
          {bereiche.map((b) => (
            <div key={b.id} className={`flex items-center gap-2 rounded border p-2 ${b.aktiv ? "" : "opacity-50"}`}>
              <span className="flex-1 text-sm">{b.name}</span>
              <Select
                value={b.verantwortlich?.id ?? "keiner"}
                onValueChange={(v) => api(`/api/fuenfs/bereiche/${b.id}`, "PATCH", { verantwortlichId: v === "keiner" ? null : v }, "Verantwortlicher gespeichert")}
              >
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Verantwortlich…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keiner">– keiner –</SelectItem>
                  {(Array.isArray(mitarbeiter) ? mitarbeiter : []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch
                checked={b.aktiv}
                onCheckedChange={(c) => api(`/api/fuenfs/bereiche/${b.id}`, "PATCH", { aktiv: c }, c ? "Aktiviert" : "Deaktiviert")}
                aria-label={`${b.name} aktiv`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-3">
          <h3 className="text-sm font-semibold">Checklisten-Vorlage (global)</h3>
          <div className="flex gap-2">
            <Select value={neuPunkt.kategorie} onValueChange={(v) => setNeuPunkt({ ...neuPunkt, kategorie: v })}>
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FUENFS_KATEGORIE_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={neuPunkt.text} onChange={(e) => setNeuPunkt({ ...neuPunkt, text: e.target.value })} placeholder="Neuer Prüfpunkt…" className="h-9" />
            <Button
              size="sm"
              disabled={!neuPunkt.text.trim()}
              onClick={async () => {
                if (await api("/api/fuenfs/checkliste", "POST", { kategorie: neuPunkt.kategorie, text: neuPunkt.text.trim(), sortorder: (punkte.at(-1)?.sortorder ?? 0) + 10 }, "Punkt angelegt")) {
                  setNeuPunkt({ ...neuPunkt, text: "" });
                }
              }}
            >
              +
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Änderungen wirken nur auf KÜNFTIGE Audits (Positionen werden eingefroren) — selten ändern, sonst springt der Trend.
          </p>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {punkte.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 rounded border p-1.5 text-xs ${p.aktiv ? "" : "opacity-50"}`}>
                <Badge variant="outline" className="text-[9px]">{p.kategorie}</Badge>
                <span className="flex-1">{p.text}</span>
                <Switch
                  checked={p.aktiv}
                  onCheckedChange={(c) => api(`/api/fuenfs/checkliste/${p.id}`, "PATCH", { aktiv: c }, c ? "Aktiviert" : "Deaktiviert")}
                  aria-label={`${p.text} aktiv`}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
