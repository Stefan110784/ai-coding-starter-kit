"use client";

import { use, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Camera, ClipboardPlus } from "lucide-react";
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
import { FUENFS_KATEGORIE_LABEL } from "@/lib/fuenfs";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Position {
  id: string;
  kategorie: string;
  text: string;
  punkte: number | null;
  nichtAnwendbar: boolean;
  bemerkung?: string | null;
  fotos: Array<{ id: string; name: string }>;
  abweichung?: { id: string; status: string; faelligAm?: string | null } | null;
}

interface Audit {
  id: string;
  monat: string;
  status: "entwurf" | "abgeschlossen";
  scoreProzent: number | null;
  liveScore: number | null;
  bemerkung?: string | null;
  bereich: { id: string; name: string; verantwortlichId?: string | null };
  positionen: Position[];
}

const PUNKT_FARBE: Record<number, string> = {
  0: "bg-red-500 text-white hover:bg-red-600",
  1: "bg-amber-400 text-black hover:bg-amber-500",
  2: "bg-green-500 text-white hover:bg-green-600",
};

/** 5S-Audit-Durchführung (KF3-36) — Tablet-Vollseite mit Autosave je Klick. */
export default function FuenfsAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hatRecht } = useMe();
  const darfAudit = hatRecht("fuenfs.audit");
  const key = `/api/fuenfs/audits/${id}`;
  const { data, isLoading } = useSWR<Audit>(key, fetcher);
  const { data: gruende } = useSWR<Array<{ id: string; name: string }>>(
    "/api/abweichungen/gruende?bereich=fuenfs",
    fetcher
  );
  const { data: mitarbeiter } = useSWR<Array<{ id: string; name: string }>>("/api/mitarbeiter", fetcher);

  const [massnahmeFuer, setMassnahmeFuer] = useState<Position | null>(null);
  const [mForm, setMForm] = useState({ beschreibung: "", grundId: "", verantwortlichId: "", faelligAm: "" });
  const [laeuft, setLaeuft] = useState(false);
  const fotoInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const audit = data && !("error" in data) ? data : null;
  const readonly = !darfAudit || audit?.status === "abgeschlossen";

  async function patchPosition(p: Position, payload: Record<string, unknown>) {
    const res = await fetch(`/api/fuenfs/positionen/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Speichern fehlgeschlagen");
      return;
    }
    mutate(key);
  }

  async function fotoHochladen(p: Position, file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/fuenfs/positionen/${p.id}/fotos`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Foto-Upload fehlgeschlagen");
      return;
    }
    toast.success("Foto gespeichert");
    mutate(key);
  }

  async function massnahmeAnlegen() {
    if (!massnahmeFuer) return;
    setLaeuft(true);
    try {
      const res = await fetch(`/api/fuenfs/positionen/${massnahmeFuer.id}/abweichung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beschreibung: mForm.beschreibung.trim(),
          ...(mForm.grundId ? { grundId: mForm.grundId } : {}),
          ...(mForm.verantwortlichId ? { verantwortlichId: mForm.verantwortlichId } : {}),
          ...(mForm.faelligAm ? { faelligAm: new Date(`${mForm.faelligAm}T12:00:00`).toISOString() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Maßnahme fehlgeschlagen");
        return;
      }
      toast.success("Maßnahme angelegt (CAPA)");
      setMassnahmeFuer(null);
      mutate(key);
    } finally {
      setLaeuft(false);
    }
  }

  async function abschliessen() {
    const res = await fetch(key, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "abgeschlossen" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Abschluss fehlgeschlagen");
      return;
    }
    toast.success(`Audit abgeschlossen — Score ${body.scoreProzent} %`);
    mutate(key);
    mutate((k) => typeof k === "string" && k.startsWith("/api/fuenfs"));
  }

  if (isLoading || !audit) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  const kategorien = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"] as const;

  return (
    <div className="space-y-4 pb-10">
      {/* Sticky-Kopf mit Live-Score */}
      <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-2 border-b bg-background px-2 py-2">
        <Button size="icon" variant="ghost" asChild aria-label="Zurück">
          <Link href="/fuenfs"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div>
          <h1 className="text-lg font-bold">{audit.bereich.name}</h1>
          <p className="text-xs text-muted-foreground">5S-Audit {audit.monat.slice(5)}/{audit.monat.slice(0, 4)}</p>
        </div>
        <span className="flex-1" />
        <Badge variant={audit.status === "abgeschlossen" ? "outline" : "secondary"}>
          {audit.status === "abgeschlossen" ? `abgeschlossen · ${audit.scoreProzent} %` : `Score: ${audit.liveScore ?? "–"} %`}
        </Badge>
        {!readonly && (
          <Button size="sm" onClick={abschliessen}>Audit abschließen</Button>
        )}
      </div>

      {kategorien.map((kat) => {
        const punkte = audit.positionen.filter((p) => p.kategorie === kat);
        if (punkte.length === 0) return null;
        return (
          <div key={kat} className="space-y-2">
            <h2 className="text-sm font-semibold">{FUENFS_KATEGORIE_LABEL[kat]}</h2>
            {punkte.map((p) => (
              <Card key={p.id} className={p.nichtAnwendbar ? "opacity-60" : ""}>
                <CardContent className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-40 flex-1 text-sm">{p.text}</p>
                    {[0, 1, 2].map((wert) => (
                      <Button
                        key={wert}
                        size="sm"
                        variant={p.punkte === wert ? "default" : "outline"}
                        className={`h-11 w-11 text-base font-bold ${p.punkte === wert ? PUNKT_FARBE[wert] : ""}`}
                        disabled={readonly || p.nichtAnwendbar}
                        onClick={() => patchPosition(p, { punkte: p.punkte === wert ? null : wert })}
                      >
                        {wert}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant={p.nichtAnwendbar ? "secondary" : "ghost"}
                      className="h-11"
                      disabled={readonly}
                      onClick={() => patchPosition(p, { nichtAnwendbar: !p.nichtAnwendbar })}
                    >
                      n. a.
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-11 w-11"
                      disabled={readonly}
                      onClick={() => fotoInputs.current[p.id]?.click()}
                      aria-label="Foto aufnehmen"
                    >
                      <Camera className="size-5" />
                    </Button>
                    <input
                      ref={(el) => { fotoInputs.current[p.id] = el; }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) fotoHochladen(p, f);
                        e.target.value = "";
                      }}
                    />
                    {!readonly && p.punkte !== null && p.punkte < 2 && !p.abweichung && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-11"
                        onClick={() => {
                          setMassnahmeFuer(p);
                          setMForm({ beschreibung: `${audit.bereich.name}: ${p.text}${p.bemerkung ? ` — ${p.bemerkung}` : ""}`, grundId: "", verantwortlichId: "", faelligAm: "" });
                        }}
                      >
                        <ClipboardPlus className="size-4 mr-1" /> Maßnahme
                      </Button>
                    )}
                    {p.abweichung && (
                      <Badge
                        variant={p.abweichung.status === "abgeschlossen" ? "outline" : "secondary"}
                        title={p.abweichung.faelligAm ? `fällig ${new Date(p.abweichung.faelligAm).toLocaleDateString("de-DE")}` : undefined}
                      >
                        Maßnahme: {p.abweichung.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.fotos.map((f) => (
                      <a key={f.id} href={`/api/fotos/${f.id}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/fotos/${f.id}`} alt={f.name} className="h-14 w-14 rounded object-cover" />
                      </a>
                    ))}
                    <Input
                      className="h-9 min-w-48 flex-1"
                      placeholder="Bemerkung…"
                      defaultValue={p.bemerkung ?? ""}
                      key={`bem-${p.id}-${p.bemerkung ?? ""}`}
                      disabled={readonly}
                      onBlur={(e) => {
                        if (e.target.value !== (p.bemerkung ?? "")) {
                          patchPosition(p, { bemerkung: e.target.value.trim() || null });
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })}

      {/* Maßnahme-Dialog */}
      <Dialog open={!!massnahmeFuer} onOpenChange={(o) => { if (!o) setMassnahmeFuer(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>5S-Maßnahme anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Beschreibung *</Label>
              <Textarea rows={2} value={mForm.beschreibung} onChange={(e) => setMForm({ ...mForm, beschreibung: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Grund (Pareto)</Label>
              <Select value={mForm.grundId || "keiner"} onValueChange={(v) => setMForm({ ...mForm, grundId: v === "keiner" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="– keiner –" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keiner">– keiner –</SelectItem>
                  {(Array.isArray(gruende) ? gruende : []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Verantwortlich</Label>
                <Select value={mForm.verantwortlichId || "bereich"} onValueChange={(v) => setMForm({ ...mForm, verantwortlichId: v === "bereich" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bereich">Bereichs-Verantwortlicher</SelectItem>
                    {(Array.isArray(mitarbeiter) ? mitarbeiter : []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fällig am</Label>
                <Input type="date" value={mForm.faelligAm} onChange={(e) => setMForm({ ...mForm, faelligAm: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMassnahmeFuer(null)}>Abbrechen</Button>
            <Button disabled={!mForm.beschreibung.trim() || laeuft} onClick={massnahmeAnlegen}>Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
