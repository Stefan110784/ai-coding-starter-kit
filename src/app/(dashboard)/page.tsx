"use client";

import useSWR from "swr";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ClipboardCheck, Clock, CheckCircle2, Activity } from "lucide-react";
import { FuenfsErinnerung } from "@/components/fuenfs-erinnerung";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_COLORS: Record<string, string> = {
  offen: "#94a3b8",
  kommissioniert: "#60a5fa",
  laeuft: "#34d399",
  pausiert: "#fbbf24",
  abgeschlossen: "#a3e635",
};

const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  kommissioniert: "Komm.",
  laeuft: "Läuft",
  pausiert: "Pausiert",
  abgeschlossen: "Fertig",
};

function formatDauer(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}min`;
}

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-muted`}>
            <Icon className={`size-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useSWR("/api/dashboard", fetcher, {
    refreshInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-5"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i}><CardContent className="pt-5"><Skeleton className="h-48 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const angemeldete: Array<{
    id: string;
    mitarbeiter: { name: string; kuerzel: string };
    auftrag: { id: string; nummer: string; bezeichnung: string; status: string };
    kategorie?: { name: string } | null;
    start: string;
    dauerMin: number;
  }> = data?.angemeldete ?? [];

  const laufende: Array<{
    id: string;
    nummer: string;
    bezeichnung: string;
    menge: number;
    zeiten: Array<{ mitarbeiter: { name: string; kuerzel: string } }>;
  }> = data?.laufendeAuftraege ?? [];

  const statusData: Array<{ status: string; anzahl: number }> = data?.auftraegeNachStatus ?? [];
  const stundenData: Array<{ name: string; kuerzel: string; stunden: number }> = data?.stundenProMitarbeiter ?? [];

  const ampel: {
    zaehler: { rot: number; gelb: number; gruen: number };
    kritisch: Array<{ id: string; nummer: string; bezeichnung: string; farbe: "rot" | "gelb"; grund: string }>;
  } = data?.ampel ?? { zaehler: { rot: 0, gelb: 0, gruen: 0 }, kritisch: [] };

  const q7 = data?.qualitaet7Tage ?? { gut: 0, ausschuss: 0, nacharbeit: 0 };
  const qGesamt = q7.gut + q7.ausschuss + q7.nacharbeit;
  const ausschussQ = qGesamt > 0 ? Math.round((q7.ausschuss / qGesamt) * 1000) / 10 : null;

  const gesamtAuftraege = statusData.reduce((s, x) => s + x.anzahl, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Activity className="size-3" /> Live · alle 15 s
        </span>
      </div>

      {/* 5S-Monats-Erinnerung (KF3-36, rein abgeleitet) */}
      <FuenfsErinnerung />

      {/* KPI-Karten */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Angemeldet"
          value={angemeldete.length}
          sub="Mitarbeiter aktiv"
          icon={Users}
          color="text-green-500"
        />
        <KpiCard
          title="In Bearbeitung"
          value={laufende.length}
          sub={`von ${gesamtAuftraege} Aufträgen`}
          icon={ClipboardCheck}
          color="text-blue-500"
        />
        <KpiCard
          title="Heute fertig"
          value={data?.heuteAbgeschlossen ?? 0}
          sub="Aufträge abgeschlossen"
          icon={CheckCircle2}
          color="text-emerald-500"
        />
        <KpiCard
          title="Ausschuss (7 Tage)"
          value={ausschussQ !== null ? `${ausschussQ}%` : "–"}
          sub={qGesamt > 0 ? `${q7.ausschuss} von ${qGesamt} Stk` : "Keine Qualitätsdaten"}
          icon={Clock}
          color={ausschussQ !== null && ausschussQ > 5 ? "text-red-500" : "text-muted-foreground"}
        />
      </div>

      {/* Statusampel über alle aktiven Aufträge (KF3-24) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Statusampel</span>
            <span className="flex items-center gap-3 text-sm font-normal">
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-full bg-red-500" /> {ampel.zaehler.rot}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-full bg-amber-400" /> {ampel.zaehler.gelb}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-full bg-green-500" /> {ampel.zaehler.gruen}
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ampel.kritisch.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1 text-center">
              Alle aktiven Aufträge im Plan
            </p>
          ) : (
            <div className="divide-y">
              {ampel.kritisch.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${a.farbe === "rot" ? "bg-red-500" : "bg-amber-400"}`}
                    />
                    <span className="font-mono text-sm font-medium">{a.nummer}</span>
                    <span className="text-xs text-muted-foreground truncate">{a.bezeichnung}</span>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{a.grund}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aktuell angemeldete Mitarbeiter */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-green-500" />
            </span>
            Aktuell angemeldet ({angemeldete.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {angemeldete.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">Niemand angemeldet</p>
          ) : (
            <div className="divide-y">
              {angemeldete.map((z) => (
                <div key={z.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {z.mitarbeiter.kuerzel}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{z.mitarbeiter.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {z.auftrag.nummer} – {z.auftrag.bezeichnung}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className="text-xs">{formatDauer(z.dauerMin)}</Badge>
                    {z.kategorie && (
                      <p className="text-xs text-muted-foreground mt-0.5">{z.kategorie.name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Laufende Aufträge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aufträge in Bearbeitung</CardTitle>
          </CardHeader>
          <CardContent>
            {laufende.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Keine laufenden Aufträge</p>
            ) : (
              <div className="divide-y">
                {laufende.map((a) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium">{a.nummer}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.bezeichnung}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end shrink-0">
                      {a.zeiten.length === 0 ? (
                        <Badge variant="outline" className="text-xs">niemand aktiv</Badge>
                      ) : (
                        a.zeiten.map((z, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{z.mitarbeiter.kuerzel}</Badge>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aufträge nach Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aufträge nach Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="status" tick={{ fontSize: 11 }} tickFormatter={(v) => STATUS_LABEL[v] ?? v} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [v, "Aufträge"]} labelFormatter={(l) => STATUS_LABEL[l] ?? l} />
                <Bar dataKey="anzahl" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Produktivstunden 7 Tage */}
      {stundenData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produktivstunden letzte 7 Tage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stundenData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis type="number" unit="h" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="kuerzel" tick={{ fontSize: 11 }} width={36} />
                <Tooltip formatter={(v) => [`${v} h`, "Stunden"]} />
                <Bar dataKey="stunden" fill="#60a5fa" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
