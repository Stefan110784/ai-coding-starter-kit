"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiDashboard } from "@/components/kpi-dashboard";
import { ParetoBlock } from "@/components/pareto-block";
import { ZeiterfassungsgradBlock } from "@/components/zeiterfassungsgrad-block";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AuswertungPage() {
  const [von, setVon] = useState(toDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [bis, setBis] = useState(toDateInput(new Date()));

  const url = `/api/auswertung?von=${von}T00:00:00.000Z&bis=${bis}T23:59:59.000Z`;
  const { data, isLoading } = useSWR(url, fetcher);

  const lagerUrl = `/api/auswertung/lager?von=${von}T00:00:00.000Z&bis=${bis}T23:59:59.000Z`;
  const { data: lager } = useSWR(lagerUrl, fetcher);

  async function exportExcel() {
    const { utils, writeFile } = await import("xlsx");
    const zeiten = (data?.zeitenProMitarbeiter ?? []).map((m: { name: string; kuerzel: string; stunden: number }) => ({
      Kürzel: m.kuerzel,
      Name: m.name,
      "Stunden (h)": m.stunden,
    }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(zeiten), "Zeiten");
    const status = (data?.auftraegeNachStatus ?? []).map((s: { status: string; anzahl: number }) => ({
      Status: s.status,
      Anzahl: s.anzahl,
    }));
    utils.book_append_sheet(wb, utils.json_to_sheet(status), "Aufträge");
    writeFile(wb, `kima-auswertung-${von}-${bis}.xlsx`);
  }

  const zeitenData = (data?.zeitenProMitarbeiter ?? []).map(
    (m: { name: string; kuerzel: string; sekunden: number }) => ({
      ...m,
      stunden: Math.round((m.sekunden / 3600) * 10) / 10,
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Auswertung</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={!data}>
            <Download className="size-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/auswertung/auftraege.csv">
              <Download className="size-4 mr-2" />
              Nachkalkulation (CSV)
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/auswertung/mitarbeiter.csv?von=${von}&bis=${bis}`}>
              <Download className="size-4 mr-2" />
              Mitarbeiterzeiten (CSV)
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/auswertung/bericht.pdf">
              <FileText className="size-4 mr-2" />
              PDF-Bericht
            </a>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="uebersicht">
        <TabsList>
          <TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="kpi">KPI</TabsTrigger>
          <TabsTrigger value="pareto">Pareto</TabsTrigger>
        </TabsList>

        <TabsContent value="kpi" className="mt-4">
          <KpiDashboard />
          <ZeiterfassungsgradBlock />
        </TabsContent>

        <TabsContent value="pareto" className="mt-4">
          <ParetoBlock />
        </TabsContent>

        <TabsContent value="uebersicht" className="mt-4 space-y-6">

      <div className="flex items-end gap-4">
        <div className="space-y-1.5">
          <Label>Von</Label>
          <Input type="date" value={von} onChange={(e) => setVon(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Bis</Label>
          <Input type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produktivstunden pro Mitarbeiter</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={zeitenData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" unit=" h" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="kuerzel" tick={{ fontSize: 12 }} width={36} />
                  <Tooltip formatter={(v) => `${v} h`} />
                  <Bar dataKey="stunden" fill="#60a5fa" name="Stunden" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aufträge nach Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data?.auftraegeNachStatus ?? []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="anzahl" fill="#a78bfa" name="Anzahl" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {data?.qualitaet && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qualitätszusammenfassung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-500">{data.qualitaet.gut}</p>
                <p className="text-sm text-muted-foreground">Gut</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-500">{data.qualitaet.nacharbeit}</p>
                <p className="text-sm text-muted-foreground">Nacharbeit</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-red-500">{data.qualitaet.ausschuss}</p>
                <p className="text-sm text-muted-foreground">Ausschuss</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lagerkennzahlen (Zeitraum, auf Jahr hochgerechnet)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold">{lager?.durchschnittsbestand ?? "–"}</p>
              <p className="text-sm text-muted-foreground">Ø-Lagerbestand</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{lager?.umschlagshaeufigkeit ?? "–"}</p>
              <p className="text-sm text-muted-foreground">Umschlag ×/Jahr</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{lager?.lagerdauerTage ?? "–"}</p>
              <p className="text-sm text-muted-foreground">Ø-Lagerdauer (Tage)</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{lager?.jahresverbrauch ?? "–"}</p>
              <p className="text-sm text-muted-foreground">Jahresverbrauch</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {lager?.lagerwert != null ? `${lager.lagerwert.toLocaleString("de-DE")} €` : "–"}
              </p>
              <p className="text-sm text-muted-foreground">Lagerwert (bewertet)</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {lager?.bewerteterVerbrauch != null ? `${lager.bewerteterVerbrauch.toLocaleString("de-DE")} €` : "–"}
              </p>
              <p className="text-sm text-muted-foreground">Materialkosten (Verbrauch)</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Mengen-Kennzahlen über alle Artikel summiert. Wertangaben nutzen den Ø-Einstandspreis aus Wareneingängen
            {lager?.artikelMitPreis != null ? ` (${lager.artikelMitPreis} Artikel mit Preis)` : ""}.
          </p>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
