"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Kpi {
  basis: number;
  onTimeDeliveryRate: number | null;
  reworkRate: number | null;
  missingPartsRate: number | null;
  avgStallDays: number | null;
  leadTimeDaysMedian: number | null;
  leadTimeDaysAvg: number | null;
  kundenLiefertreueRate: number | null;
  kundenLiefertreueBasis: number;
}

// KPI-Definitionen mit Richtwerten (V2: KPI_DEFS in auswertung.js)
const KPI_DEFS = [
  { key: "onTimeDeliveryRate", label: "Liefertreue (Fertigung)", einheit: " %", richtwert: 95, richtung: "hoch" as const },
  // Ende-zu-Ende gegen den Kundenwunschtermin (KF3-37) — andere Grundgesamtheit
  // als die Fertigungs-Liefertreue (gelieferte Kundenaufträge statt FA-Enden)
  { key: "kundenLiefertreueRate", label: "Liefertreue (Kunde)", einheit: " %", richtwert: 95, richtung: "hoch" as const },
  { key: "reworkRate", label: "Nacharbeitsquote", einheit: " %", richtwert: 5, richtung: "niedrig" as const },
  { key: "missingPartsRate", label: "Fehlteilquote", einheit: " %", richtwert: null, richtung: "niedrig" as const },
  { key: "leadTimeDaysMedian", label: "Ø Durchlaufzeit", einheit: " Tage", richtwert: null, richtung: "niedrig" as const },
];

/** ISO-Woche eines Datums (client-seitig, lokal). */
function aktuelleIsoWoche(): { jahr: number; woche: number } {
  const d = new Date();
  const ziel = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = ziel.getUTCDay() || 7;
  ziel.setUTCDate(ziel.getUTCDate() + 4 - dow);
  const jahr = ziel.getUTCFullYear();
  const jan1 = new Date(Date.UTC(jahr, 0, 1));
  const woche = Math.ceil(((ziel.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return { jahr, woche };
}

function verschiebe(jahr: number, woche: number, delta: number): { jahr: number; woche: number } {
  // Montag der Woche bestimmen, verschieben, neu einordnen
  const jan4 = new Date(Date.UTC(jahr, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const montagKw1 = new Date(jan4);
  montagKw1.setUTCDate(jan4.getUTCDate() - (dow - 1));
  const montag = new Date(montagKw1);
  montag.setUTCDate(montagKw1.getUTCDate() + (woche - 1 + delta) * 7);
  const ziel = new Date(montag);
  const zdow = ziel.getUTCDay() || 7;
  ziel.setUTCDate(ziel.getUTCDate() + 4 - zdow);
  const zjahr = ziel.getUTCFullYear();
  const jan1 = new Date(Date.UTC(zjahr, 0, 1));
  return { jahr: zjahr, woche: Math.ceil(((ziel.getTime() - jan1.getTime()) / 86400000 + 1) / 7) };
}

function wertFarbe(def: (typeof KPI_DEFS)[number], wert: number | null): string {
  if (wert === null || def.richtwert === null) return "";
  const gut = def.richtung === "hoch" ? wert >= def.richtwert : wert <= def.richtwert;
  return gut ? "text-green-600" : "text-destructive";
}

/** KPI-Karten mit Wochen-Navigation + Verlaufs-Chart (V2: KPI-Dashboard). */
export function KpiDashboard() {
  const [kw, setKw] = useState(aktuelleIsoWoche());
  const [verlaufWochen, setVerlaufWochen] = useState("8");

  const { data: kpi, isLoading } = useSWR<Kpi & { year: number; week: number }>(
    `/api/auswertung/kpi?year=${kw.jahr}&week=${kw.woche}`, fetcher
  );
  const { data: verlauf } = useSWR(
    `/api/auswertung/kpi/verlauf?weeks=${verlaufWochen}`, fetcher
  );

  const verlaufDaten = Array.isArray(verlauf) ? verlauf : [];

  return (
    <div className="space-y-4">
      {/* ── Wochen-Navigation ─────────────────────── */}
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" onClick={() => setKw((k) => verschiebe(k.jahr, k.woche, -1))} aria-label="Vorherige Woche">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-28 text-center font-medium">
          KW {String(kw.woche).padStart(2, "0")}/{kw.jahr}
        </span>
        <Button size="icon" variant="outline" onClick={() => setKw((k) => verschiebe(k.jahr, k.woche, 1))} aria-label="Nächste Woche">
          <ChevronRight className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setKw(aktuelleIsoWoche())}>
          Aktuelle Woche
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {kpi ? `${kpi.basis} abgeschlossene Aufträge` : ""}
        </span>
      </div>

      {/* ── KPI-Karten ───────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {KPI_DEFS.map((def) => {
          const wert = kpi ? (kpi[def.key as keyof Kpi] as number | null) : null;
          return (
            <Card
              key={def.key}
              title={
                def.key === "kundenLiefertreueRate"
                  ? "Ende-zu-Ende gegen den Kundenwunschtermin (gelieferte Kundenaufträge) — andere Grundgesamtheit als die Fertigungs-Liefertreue (abgeschlossene Fertigungsaufträge gegen zugesagten Termin)"
                  : undefined
              }
            >
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">{def.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <p className={`text-2xl font-bold ${wertFarbe(def, wert)}`}>
                      {wert !== null ? `${wert}${def.einheit}` : "–"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {def.richtwert !== null
                        ? `Ziel ${def.richtung === "hoch" ? "≥" : "<"} ${def.richtwert}${def.einheit}`
                        : "niedriger ist besser"}
                      {def.key === "missingPartsRate" && kpi?.avgStallDays != null &&
                        ` · Ø ${kpi.avgStallDays} Stalltage`}
                      {def.key === "leadTimeDaysMedian" && kpi?.leadTimeDaysAvg != null &&
                        ` · Ø ${kpi.leadTimeDaysAvg} Tage (Mittel)`}
                      {def.key === "kundenLiefertreueRate" &&
                        ` · ${kpi?.kundenLiefertreueBasis ?? 0} Kundenaufträge`}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Verlauf ──────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">KPI-Verlauf</CardTitle>
          <Select value={verlaufWochen} onValueChange={setVerlaufWochen}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="8">8 Wochen</SelectItem>
              <SelectItem value="13">13 Wochen</SelectItem>
              <SelectItem value="26">26 Wochen</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {verlaufDaten.length === 0 ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={verlaufDaten}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="prozent" unit=" %" tick={{ fontSize: 11 }} domain={[0, 100]} />
                <YAxis yAxisId="tage" orientation="right" unit=" T" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="prozent" type="monotone" dataKey="onTimeDeliveryRate" name="Liefertreue %" stroke="#16a34a" connectNulls />
                <Line yAxisId="prozent" type="monotone" dataKey="reworkRate" name="Nacharbeit %" stroke="#eab308" connectNulls />
                <Line yAxisId="prozent" type="monotone" dataKey="missingPartsRate" name="Fehlteile %" stroke="#ef4444" connectNulls />
                <Line yAxisId="tage" type="monotone" dataKey="leadTimeDaysMedian" name="Durchlaufzeit (Tage)" stroke="#60a5fa" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
