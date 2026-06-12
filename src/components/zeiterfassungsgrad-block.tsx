"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Grad {
  monat: string;
  sollStunden: number | null;
  istStunden: number;
  gradProzent: number | null;
  status: "imKorridor" | "zuNiedrig" | "zuHoch" | "keinSoll" | "keineZeiten";
  laufend?: boolean;
}

function aktuellerMonat(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 7);
}

function verschiebeMonat(monat: string, delta: number): string {
  const [j, m] = monat.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Zeiterfassungsgrad (KF3-35) — Prozess-KPI, NUR Team/Monat. Korridor 70–85 %
 * beidseitig: darunter Datenqualität/Gemeinkosten, darüber unplausibel.
 */
export function ZeiterfassungsgradBlock() {
  const { hatRecht } = useMe();
  const [monat, setMonat] = useState(aktuellerMonat());
  const { data: grad, isLoading } = useSWR<Grad>(
    `/api/auswertung/zeiterfassungsgrad?monat=${monat}`,
    fetcher
  );
  const { data: verlauf } = useSWR<Grad[]>("/api/auswertung/zeiterfassungsgrad?monate=12", fetcher);
  const { data: sollInfo } = useSWR<{ sollStunden: number | null; bemerkung: string | null; vorschlagStunden: number | null }>(
    `/api/zeitsoll?monat=${monat}`,
    fetcher
  );

  const [dialogOffen, setDialogOffen] = useState(false);
  const [sollEingabe, setSollEingabe] = useState("");
  const [bemerkung, setBemerkung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function sollSpeichern() {
    setLaeuft(true);
    try {
      const res = await fetch("/api/zeitsoll", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monat,
          sollStunden: parseFloat(sollEingabe),
          ...(bemerkung.trim() ? { bemerkung: bemerkung.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Speichern fehlgeschlagen");
        return;
      }
      toast.success(`Soll für ${monat} gespeichert`);
      setDialogOffen(false);
      mutate((k) => typeof k === "string" && (k.startsWith("/api/auswertung/zeiterfassungsgrad") || k.startsWith("/api/zeitsoll")));
    } finally {
      setLaeuft(false);
    }
  }

  const farbe =
    grad?.status === "imKorridor"
      ? "text-green-600"
      : grad?.status === "keinSoll" || grad?.status === "keineZeiten"
        ? "text-muted-foreground"
        : "text-destructive";

  const chartDaten = (Array.isArray(verlauf) ? verlauf : []).map((g) => ({
    label: (g as Grad & { label?: string }).label ?? g.monat,
    gradProzent: g.gradProzent,
  }));

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Zeiterfassungsgrad (Team)</h2>
        <Badge variant="outline" className="text-[10px]" title="Prozess-KPI: nur als Teamkennzahl je Monat — bewusst keine Personenwerte (Kap. 4)">
          Team · Monat
        </Badge>
        <span className="flex-1" />
        <Button size="icon" variant="outline" className="size-7" onClick={() => setMonat(verschiebeMonat(monat, -1))} aria-label="Vormonat">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-20 text-center text-sm font-medium">{monat.slice(5)}/{monat.slice(0, 4)}</span>
        <Button size="icon" variant="outline" className="size-7" onClick={() => setMonat(verschiebeMonat(monat, 1))} aria-label="Folgemonat">
          <ChevronRight className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMonat(aktuellerMonat())}>Aktueller Monat</Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Grad {grad?.laufend && <Badge variant="secondary" className="ml-1 text-[10px]">läuft</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : grad?.status === "keinSoll" ? (
              <>
                <p className="text-2xl font-bold text-muted-foreground">–</p>
                <p className="text-xs text-muted-foreground">Kein Monats-Soll gepflegt.</p>
                {hatRecht("verwaltung") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      setSollEingabe(sollInfo?.vorschlagStunden ? String(sollInfo.vorschlagStunden) : "");
                      setBemerkung(sollInfo?.bemerkung ?? "");
                      setDialogOffen(true);
                    }}
                  >
                    Soll pflegen
                  </Button>
                )}
              </>
            ) : (
              <>
                <p className={`text-2xl font-bold ${farbe}`}>
                  {grad?.gradProzent != null ? `${grad.gradProzent} %` : "–"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ziel 70–85 % · &lt;70: Datenqualität/Gemeinkosten prüfen · &gt;85: unplausibel hoch
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ist / Soll</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <p className="text-2xl font-bold">
                  {grad?.istStunden ?? 0} h
                  <span className="text-base font-normal text-muted-foreground"> / {grad?.sollStunden ?? "–"} h</span>
                </p>
                {hatRecht("verwaltung") && grad?.status !== "keinSoll" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-7 px-2 text-xs"
                    onClick={() => {
                      setSollEingabe(grad?.sollStunden ? String(grad.sollStunden) : "");
                      setBemerkung(sollInfo?.bemerkung ?? "");
                      setDialogOffen(true);
                    }}
                  >
                    Soll ändern
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hinweis</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Nicht-Auftragszeiten (Rüsten, Orga …) als Zeitkategorien mit „zählt nicht als Auftragszeit“
            pflegen — sonst ist der Grad künstlich hoch. Soll = Team-Anwesenheit abzüglich
            Feiertage/Urlaub/Krankheit (manuell, 1 Zahl je Monat).
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Verlauf (12 Monate)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartDaten.length === 0 ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartDaten}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit=" %" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(w) => [`${w ?? "–"} %`, "Grad"]} />
                <ReferenceArea y1={70} y2={85} fill="var(--chart-2, #22c55e)" fillOpacity={0.12} />
                <Line dataKey="gradProzent" stroke="var(--chart-1, #2563eb)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Team-Soll für {monat.slice(5)}/{monat.slice(0, 4)}</DialogTitle>
            <DialogDescription>
              {sollInfo?.vorschlagStunden != null
                ? `Vorschlag aus Wochenstunden × Arbeitstage: ${sollInfo.vorschlagStunden} h — Feiertage, Urlaub und Krankheit bitte abziehen.`
                : "Kein Vorschlag möglich — Wochenstunden an den Mitarbeitern pflegen (Verwaltung)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Soll-Stunden (Team) *</Label>
              <Input type="number" min="1" step="0.5" value={sollEingabe} onChange={(e) => setSollEingabe(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bemerkung</Label>
              <Input value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} placeholder="z. B. Fronleichnam, 1 Wo Urlaub" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOffen(false)}>Abbrechen</Button>
            <Button disabled={laeuft || !(parseFloat(sollEingabe) > 0)} onClick={sollSpeichern}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
