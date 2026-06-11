"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ParetoPosition {
  key: string;
  label: string;
  anzahl: number;
  prozent: number;
  kumProzent: number;
}

interface ParetoErgebnis {
  gesamt: number;
  positionen: ParetoPosition[];
  sonstigeAnzahl: number;
  ohneGrund: number;
}

const ABW_TYPEN = [
  { value: "nacharbeit", label: "Nacharbeit" },
  { value: "ausschuss", label: "Ausschuss" },
  { value: "reklamationKunde", label: "Reklamation Kunde" },
  { value: "reklamationLieferant", label: "Reklamation Lieferant" },
  { value: "alle", label: "Alle Typen" },
];

function vorTagen(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  return d.toISOString().slice(0, 10);
}

/** Pareto-Auswertung (KF3-34): Nacharbeitsgründe / Fehlteile mit 80/20-Linie. */
export function ParetoBlock() {
  const [typ, setTyp] = useState<"nacharbeitsgruende" | "fehlteile">("nacharbeitsgruende");
  const [abwTyp, setAbwTyp] = useState("nacharbeit");
  const [quelle, setQuelle] = useState<"bestellbezug" | "mangel">("bestellbezug");
  const [von, setVon] = useState(vorTagen(90));
  const [bis, setBis] = useState(vorTagen(0));

  const query = `typ=${typ}&von=${von}&bis=${bis}&abwTyp=${abwTyp}&quelle=${quelle}`;
  const { data, isLoading } = useSWR<ParetoErgebnis>(
    von && bis && von <= bis ? `/api/auswertung/pareto?${query}` : null,
    fetcher
  );

  const ergebnis = data && Array.isArray(data.positionen) ? data : null;
  const chartDaten = (ergebnis?.positionen ?? []).map((p) => ({
    ...p,
    kurz: p.key === "ohne" ? "(ohne)" : p.key.length > 12 ? `${p.key.slice(0, 11)}…` : p.key,
  }));
  const top80 = (ergebnis?.positionen ?? []).filter((p) => p.kumProzent <= 80);
  const ohneGrundDominiert =
    typ === "nacharbeitsgruende" &&
    (ergebnis?.gesamt ?? 0) > 0 &&
    (ergebnis?.ohneGrund ?? 0) / (ergebnis?.gesamt ?? 1) > 0.2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Auswertung</Label>
          <Select value={typ} onValueChange={(v) => setTyp(v as typeof typ)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nacharbeitsgruende">Nacharbeitsgründe</SelectItem>
              <SelectItem value="fehlteile">Fehlteile</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {typ === "nacharbeitsgruende" ? (
          <div className="space-y-1.5">
            <Label>Abweichungstyp</Label>
            <Select value={abwTyp} onValueChange={setAbwTyp}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ABW_TYPEN.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Quelle</Label>
            <Select value={quelle} onValueChange={(v) => setQuelle(v as typeof quelle)}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bestellbezug">Bestellungen mit Auftragsbezug</SelectItem>
                <SelectItem value="mangel">Mangel bei Kommissionierung</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Von</Label>
          <Input type="date" value={von} onChange={(e) => setVon(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Bis</Label>
          <Input type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
        </div>
        <Button variant="outline" asChild>
          <a href={`/api/auswertung/pareto.csv?${query}`}>
            <Download className="size-4 mr-2" />
            CSV
          </a>
        </Button>
      </div>

      {isLoading || !ergebnis ? (
        <Skeleton className="h-72 w-full" />
      ) : ergebnis.gesamt === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Keine Datenpunkte im Zeitraum. Zeitraum erweitern oder Quelle wechseln.
            {typ === "fehlteile" && (
              <p className="mt-2 text-xs">
                Fehlteil-Signale entstehen aus Bestellungen mit Auftragsbezug bzw. aus dem
                Fehlteile-Kennzeichen am Auftrag — beides muss im Tagesgeschäft gepflegt sein.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>n = {ergebnis.gesamt}</span>
            {ergebnis.gesamt < 10 && (
              <Badge variant="secondary">geringe Datenbasis — 80/20-Aussage eingeschränkt</Badge>
            )}
            {ohneGrundDominiert && (
              <Badge variant="destructive">
                {ergebnis.ohneGrund}× ohne Grund erfasst — Grund-Pflege verbessern
              </Badge>
            )}
            {ergebnis.sonstigeAnzahl > 0 && <span>+ {ergebnis.sonstigeAnzahl} in „Sonstige“</span>}
          </div>

          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartDaten}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="kurz" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis yAxisId="links" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="rechts" orientation="right" domain={[0, 100]} unit=" %" tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(wert, name) =>
                      name === "kumuliert" ? [`${wert} %`, "kumuliert"] : [wert ?? 0, "Anzahl"]
                    }
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                  />
                  <ReferenceLine yAxisId="rechts" y={80} strokeDasharray="4 4" stroke="var(--destructive)" />
                  <Bar yAxisId="links" dataKey="anzahl" name="Anzahl" fill="var(--chart-1, #2563eb)" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="rechts" dataKey="kumProzent" name="kumuliert" stroke="var(--chart-2, #f59e0b)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top-Verursacher bis 80 %</CardTitle>
            </CardHeader>
            <CardContent>
              {top80.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Kein Verursacher unterhalb der 80 %-Marke — die Fälle verteilen sich breit.
                </p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {top80.map((p, i) => (
                    <li key={p.key} className="flex items-center gap-2">
                      <span className="w-5 text-right text-muted-foreground">{i + 1}.</span>
                      <span className="flex-1">{p.label}</span>
                      <span className="font-mono">{p.anzahl}×</span>
                      <span className="w-16 text-right font-mono text-muted-foreground">{p.kumProzent} %</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
