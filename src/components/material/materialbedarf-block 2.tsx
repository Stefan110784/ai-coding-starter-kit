"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BedarfPosition {
  artikelnummer: string;
  bezeichnung?: string | null;
  einheit?: string | null;
  bruttobedarf: number;
  bestand: number;
  nettobedarf: number;
  ausLager?: number;
  typ: "einzelteil" | "baugruppe";
  ebene?: number;
}

function fmtDauerSek(sek: number): string {
  const s = Math.round(sek);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function rund(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Materialbedarf-Block im Auftrags-Detail: Listen-/Baum-Sicht (V2: auftraege.js). */
export function MaterialbedarfBlock({ auftragId }: { auftragId: string }) {
  const { data, isLoading } = useSWR(`/api/material/bedarf/${auftragId}`, fetcher);
  const [sicht, setSicht] = useState<"baum" | "liste">("baum");

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    );
  }

  const positionen: BedarfPosition[] = data.positionen ?? [];
  const baum: BedarfPosition[] = data.baum ?? [];
  const mangelnd: BedarfPosition[] = data.mangelnd ?? [];
  const mangelSet = new Set(mangelnd.map((m) => m.artikelnummer));
  const zeilen = sicht === "baum" ? baum : positionen;

  if (baum.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Kein Materialbedarf (keine Stammartikel-Positionen).</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          {typeof data.sollSekundenNetto === "number" ? (
            <span>
              Geplante Fertigungszeit: <strong>{fmtDauerSek(data.sollSekundenNetto)}</strong>
            </span>
          ) : (
            <span className="text-muted-foreground">Geplante Fertigungszeit: —</span>
          )}
          {data.mangel && <Badge variant="destructive">Materialmangel</Badge>}
          {data.eingefroren && (
            <Badge
              variant="outline"
              title={`Materialstand eingefroren bei Kommissionierung${data.eingefrorenAm ? ` am ${new Date(data.eingefrorenAm).toLocaleDateString("de-DE")}` : ""} (ISO 7.5)`}
            >
              Stand Kommissionierung
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={sicht === "baum" ? "default" : "outline"} onClick={() => setSicht("baum")}>
            Baum
          </Button>
          <Button size="sm" variant={sicht === "liste" ? "default" : "outline"} onClick={() => setSicht("liste")}>
            Liste
          </Button>
        </div>
      </div>

      {data.mangel && mangelnd.length > 0 && (
        <p className="text-xs text-destructive">
          Fehlend: {mangelnd.map((m) => `${m.artikelnummer} (${rund(m.nettobedarf)})`).join(", ")}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artikel</TableHead>
            <TableHead>Bezeichnung</TableHead>
            <TableHead className="w-12">Typ</TableHead>
            <TableHead className="text-right">Bedarf</TableHead>
            <TableHead className="text-right">Bestand</TableHead>
            <TableHead className="text-right">Netto</TableHead>
            <TableHead>Einheit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {zeilen.map((p, i) => {
            const rot =
              sicht === "liste"
                ? mangelSet.has(p.artikelnummer)
                : p.typ === "einzelteil" && p.nettobedarf > 0 && p.bestand < p.bruttobedarf;
            return (
              <TableRow key={`${p.artikelnummer}-${i}`} className={rot ? "text-destructive" : ""}>
                <TableCell
                  className="font-mono text-xs"
                  style={sicht === "baum" ? { paddingLeft: `${0.5 + (p.ebene ?? 0) * 1.25}rem` } : undefined}
                >
                  {p.artikelnummer}
                </TableCell>
                <TableCell className="text-xs">{p.bezeichnung}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.typ === "baugruppe" ? "Bgr." : "ET"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{rund(p.bruttobedarf)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{rund(p.bestand)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{rund(p.nettobedarf)}</TableCell>
                <TableCell className="text-xs">{p.einheit ?? ""}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
