"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { X, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

interface UebersichtAuftrag {
  id: string;
  nummer: string;
  bezeichnung: string;
  status: string;
  mitarbeiter: Array<{ id: string; name: string; kuerzel: string }>;
}

const KEY = "/api/arbeitsvorrat/uebersicht";

function Zeile({
  auftrag,
  alleMitarbeiter,
}: {
  auftrag: UebersichtAuftrag;
  alleMitarbeiter: Array<{ id: string; name: string; kuerzel: string; status: string }>;
}) {
  const [auswahl, setAuswahl] = useState("");
  const zugewiesenIds = new Set(auftrag.mitarbeiter.map((m) => m.id));
  const kandidaten = alleMitarbeiter.filter((m) => m.status === "aktiv" && !zugewiesenIds.has(m.id));

  async function zuweisen(mitarbeiterId: string) {
    const res = await fetch(`/api/auftraege/${auftrag.id}/mitarbeiter/${mitarbeiterId}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Zuweisen fehlgeschlagen"); return; }
    setAuswahl("");
    mutate(KEY);
    mutate(`/api/auftraege/${auftrag.id}`);
  }

  async function entfernen(mitarbeiterId: string) {
    const res = await fetch(`/api/auftraege/${auftrag.id}/mitarbeiter/${mitarbeiterId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Entfernen fehlgeschlagen"); return; }
    mutate(KEY);
    mutate(`/api/auftraege/${auftrag.id}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 last:border-0">
      <div className="min-w-40">
        <span className="font-mono text-sm font-medium">{auftrag.nummer}</span>
        <span className="block truncate text-xs text-muted-foreground">{auftrag.bezeichnung}</span>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {auftrag.mitarbeiter.map((m) => (
          <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
            {m.kuerzel}
            <button
              className="rounded-full hover:bg-muted-foreground/20"
              onClick={() => entfernen(m.id)}
              aria-label={`${m.name} entfernen`}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {auftrag.mitarbeiter.length === 0 && (
          <span className="text-xs text-muted-foreground">unbesetzt</span>
        )}
      </div>
      <Select value={auswahl} onValueChange={zuweisen}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder={<span className="flex items-center gap-1"><UserPlus className="size-3" /> Zuweisen…</span>} />
        </SelectTrigger>
        <SelectContent>
          {kandidaten.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {m.kuerzel} – {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Team-Verwaltung im Auftrags-Detail: Badges + Zuweisen/Entfernen (Recht verwaltung). */
export function AuftragTeam({
  auftragId,
  auftragNummer,
  team,
  darfVerwalten,
}: {
  auftragId: string;
  auftragNummer: string;
  team: Array<{ mitarbeiter: { id: string; name: string; kuerzel: string } }>;
  darfVerwalten: boolean;
}) {
  const { data: mitarbeiter } = useSWR(darfVerwalten ? "/api/mitarbeiter" : null, fetcher);
  const [auswahl, setAuswahl] = useState("");
  const istS = auftragNummer.startsWith("S");
  const zugewiesenIds = new Set(team.map((t) => t.mitarbeiter.id));
  const kandidaten = (Array.isArray(mitarbeiter) ? mitarbeiter : []).filter(
    (m: { id: string; status: string }) => m.status === "aktiv" && !zugewiesenIds.has(m.id)
  );

  async function aendern(mitarbeiterId: string, methode: "POST" | "DELETE") {
    const res = await fetch(`/api/auftraege/${auftragId}/mitarbeiter/${mitarbeiterId}`, { method: methode });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Fehler"); return; }
    setAuswahl("");
    mutate(`/api/auftraege/${auftragId}`);
    mutate(KEY);
  }

  if (istS) {
    return (
      <p className="text-sm text-muted-foreground">
        S-Aufträge sind für alle Mitarbeiter sichtbar und werden nicht zugewiesen.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {team.map((t) => (
          <Badge key={t.mitarbeiter.id} variant="secondary" className="gap-1 pr-1">
            {t.mitarbeiter.kuerzel} – {t.mitarbeiter.name}
            {darfVerwalten && (
              <button
                className="rounded-full hover:bg-muted-foreground/20"
                onClick={() => aendern(t.mitarbeiter.id, "DELETE")}
                aria-label={`${t.mitarbeiter.name} entfernen`}
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        {team.length === 0 && <span className="text-sm text-muted-foreground">Niemand zugewiesen</span>}
      </div>
      {darfVerwalten && (
        <Select value={auswahl} onValueChange={(v) => aendern(v, "POST")}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder={<span className="flex items-center gap-1"><UserPlus className="size-3" /> Mitarbeiter zuweisen…</span>} />
          </SelectTrigger>
          <SelectContent>
            {kandidaten.map((m: { id: string; name: string; kuerzel: string }) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.kuerzel} – {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** Admin-Übersicht: aktive P/L-Aufträge mit Arbeitsvorrat-Zuweisungen (V2: verwaltung.js). */
export function ZuweisungUebersicht() {
  const { data, isLoading } = useSWR(KEY, fetcher);
  const { data: mitarbeiter } = useSWR("/api/mitarbeiter", fetcher);

  const auftraege: UebersichtAuftrag[] = Array.isArray(data) ? data : [];
  const alleMitarbeiter = Array.isArray(mitarbeiter) ? mitarbeiter : [];
  const zugewiesen = auftraege.filter((a) => a.mitarbeiter.length > 0);
  const unbesetzt = auftraege.filter((a) => a.mitarbeiter.length === 0);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Zugewiesene Aufträge erscheinen im persönlichen Arbeitsvorrat des Mitarbeiters
        (Zeiterfassung). S-Aufträge sind immer für alle sichtbar.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zugewiesen ({zugewiesen.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {zugewiesen.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-muted-foreground">Keine Zuweisungen</p>
          ) : (
            zugewiesen.map((a) => <Zeile key={a.id} auftrag={a} alleMitarbeiter={alleMitarbeiter} />)
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unbesetzt ({unbesetzt.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {unbesetzt.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-muted-foreground">Alle aktiven Aufträge sind besetzt</p>
          ) : (
            unbesetzt.map((a) => <Zeile key={a.id} auftrag={a} alleMitarbeiter={alleMitarbeiter} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
