"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RotateCcw, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { KommissionierDialog } from "@/components/material/kommissionier-dialog";
import { ScanButton } from "@/components/scan-input";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface KommissionierPosition {
  artikelnummer: string;
  bezeichnung?: string | null;
  einheit?: string | null;
  bruttobedarf: number;
  bestand: number;
  nettobedarf: number;
  ausLager: number;
  typ: "einzelteil" | "baugruppe";
  lagerort?: string | null;
  lagerplatz?: string | null;
  abgehakt: boolean;
}

interface AuftragKurz {
  id: string;
  nummer: string;
  bezeichnung: string;
  menge: number;
  status: string;
}

function Positionsliste({
  auftrag,
  darfStatus,
  onAbschliessen,
}: {
  auftrag: AuftragKurz;
  darfStatus: boolean;
  onAbschliessen: (a: AuftragKurz) => void;
}) {
  const key = `/api/kommissionierung/${auftrag.id}`;
  const { data, isLoading } = useSWR(key, fetcher);
  const positionen: KommissionierPosition[] = data?.positionen ?? [];

  async function setCheck(artikelnummer: string, abgehakt: boolean) {
    // Optimistisch abhaken, bei Fehler zurückrollen
    mutate(
      key,
      {
        ...data,
        positionen: positionen.map((p) =>
          p.artikelnummer === artikelnummer ? { ...p, abgehakt } : p
        ),
      },
      false
    );
    const res = await fetch(`${key}/${encodeURIComponent(artikelnummer)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abgehakt }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Abhaken fehlgeschlagen");
    }
    mutate(key);
  }

  async function alleZuruecksetzen() {
    const res = await fetch(`${key}/checks`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Zurücksetzen fehlgeschlagen");
      return;
    }
    toast.success("Checks zurückgesetzt");
    mutate(key);
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    );
  }

  if (positionen.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">Kein Materialbedarf (keine Stammartikel-Positionen).</p>;
  }

  const abgehaktAnzahl = positionen.filter((p) => p.abgehakt).length;

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Lagerort</TableHead>
            <TableHead>Lagerplatz</TableHead>
            <TableHead>Artikel</TableHead>
            <TableHead className="text-right">Menge</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead className="text-right">Fehlt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positionen.map((p) => {
            const fehlt = p.nettobedarf > 0 && p.bestand < p.bruttobedarf;
            const menge = p.ausLager > 0 ? p.ausLager : p.nettobedarf;
            return (
              <TableRow key={p.artikelnummer} className={p.abgehakt ? "opacity-60" : ""}>
                <TableCell>
                  <Checkbox
                    checked={p.abgehakt}
                    onCheckedChange={(c) => setCheck(p.artikelnummer, c === true)}
                    aria-label={`${p.artikelnummer} abhaken`}
                  />
                </TableCell>
                <TableCell className="text-sm">{p.lagerort ?? "–"}</TableCell>
                <TableCell className="font-mono text-xs">{p.lagerplatz ?? "–"}</TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{p.artikelnummer}</div>
                  <div className="text-xs text-muted-foreground">{p.bezeichnung}</div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {menge} {p.einheit ?? ""}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{p.bestand}</TableCell>
                <TableCell className={`text-right font-mono ${fehlt ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                  {fehlt ? p.nettobedarf : "–"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs text-muted-foreground">
          {abgehaktAnzahl} von {positionen.length} abgehakt
        </span>
        <div className="flex gap-2">
          <ScanButton
            size="sm"
            title="Artikel scannen"
            onScan={(code) => {
              const p = positionen.find(
                (pos) => pos.artikelnummer.toLowerCase() === code.toLowerCase()
              );
              if (!p) {
                toast.error(`Artikel „${code}" steht nicht auf dieser Kommissionierliste`);
                return;
              }
              if (p.abgehakt) {
                toast.info(`${p.artikelnummer} ist bereits abgehakt`);
                return;
              }
              setCheck(p.artikelnummer, true);
              toast.success(`${p.artikelnummer} abgehakt`);
            }}
          />
          <Button size="sm" variant="outline" onClick={alleZuruecksetzen}>
            <RotateCcw className="size-3 mr-1" /> Zurücksetzen
          </Button>
          {darfStatus && auftrag.status === "offen" && (
            <Button size="sm" onClick={() => onAbschliessen(auftrag)}>
              <PackageCheck className="size-3 mr-1" /> Kommissionierung abschließen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Kommissionierungs-Tab im Lager (V2: material.js Kommissionierung). */
export function KommissionierungTab({ darfStatus }: { darfStatus: boolean }) {
  const { data: offene } = useSWR("/api/auftraege?status=offen", fetcher, { refreshInterval: 30000 });
  const { data: kommissionierte } = useSWR("/api/auftraege?status=kommissioniert", fetcher, { refreshInterval: 30000 });
  const [aufgeklappt, setAufgeklappt] = useState<Record<string, boolean>>({});
  const [dialogAuftrag, setDialogAuftrag] = useState<AuftragKurz | null>(null);

  // S-Aufträge (Sonderaufträge) haben keine Kommissionierung (V2-Verhalten)
  const auftraege: AuftragKurz[] = [
    ...(Array.isArray(offene) ? offene : []),
    ...(Array.isArray(kommissionierte) ? kommissionierte : []),
  ].filter((a: AuftragKurz) => !a.nummer.startsWith("S"));

  function neuLaden() {
    mutate("/api/auftraege?status=offen");
    mutate("/api/auftraege?status=kommissioniert");
    mutate((key) => typeof key === "string" && key.startsWith("/api/material/bewegungen"));
    mutate("/api/material/bestaende");
  }

  if (auftraege.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Keine offenen oder kommissionierten Aufträge.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {auftraege.map((a) => (
        <Card key={a.id} className="py-0">
          <Collapsible
            open={aufgeklappt[a.id] ?? false}
            onOpenChange={(o) => setAufgeklappt((s) => ({ ...s, [a.id]: o }))}
          >
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50">
                {aufgeklappt[a.id] ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                <span className="font-mono font-medium">{a.nummer}</span>
                <span className="flex-1 truncate text-sm text-muted-foreground">{a.bezeichnung}</span>
                <span className="text-sm">{a.menge} Stk</span>
                <Badge variant={a.status === "offen" ? "secondary" : "outline"}>
                  {a.status === "offen" ? "Offen" : "Kommissioniert"}
                </Badge>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Positionsliste auftrag={a} darfStatus={darfStatus} onAbschliessen={setDialogAuftrag} />
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}

      <KommissionierDialog
        auftrag={dialogAuftrag}
        open={!!dialogAuftrag}
        onOpenChange={(o) => { if (!o) setDialogAuftrag(null); }}
        onDone={() => {
          neuLaden();
          if (dialogAuftrag) mutate(`/api/kommissionierung/${dialogAuftrag.id}`);
        }}
      />
    </div>
  );
}
