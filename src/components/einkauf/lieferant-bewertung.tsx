"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Bewertung {
  lieferantId: string;
  termintreueBasis: number;
  termintreueProzent: number | null;
  qualitaetBasis: number;
  qualitaetProzent: number | null;
}

function prozentBadge(wert: number | null, basis: number, label: string) {
  if (wert === null) {
    return (
      <span className="text-xs text-muted-foreground">{label}: noch keine Daten</span>
    );
  }
  const variant = wert >= 95 ? "default" : wert >= 80 ? "secondary" : "destructive";
  return (
    <span className="flex items-center gap-1 text-xs">
      {label}:
      <Badge variant={variant}>{wert} %</Badge>
      <span className="text-muted-foreground">({basis})</span>
    </span>
  );
}

/**
 * Automatische Lieferantenbewertung (ISO 8.4, KF3-32): Termintreue aus
 * Wareneingängen, Qualität aus Eingangsprüfungen — keine Excel-Doppelpflege.
 */
export function LieferantBewertungBlock({ lieferantId }: { lieferantId: string }) {
  const { data, isLoading } = useSWR("/api/einkauf/lieferantenbewertung", fetcher);
  if (isLoading) return <Skeleton className="h-5 w-64" />;
  const bewertung: Bewertung | undefined = Array.isArray(data)
    ? data.find((b: Bewertung) => b.lieferantId === lieferantId)
    : undefined;
  if (!bewertung) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted/50 px-3 py-2">
      {prozentBadge(bewertung.termintreueProzent, bewertung.termintreueBasis, "Termintreue")}
      {prozentBadge(bewertung.qualitaetProzent, bewertung.qualitaetBasis, "Qualität")}
    </div>
  );
}

interface PreisZeile {
  id: string;
  preis: number;
  gueltigAb: string;
  quelle?: string | null;
  benutzer?: { username: string; name?: string | null } | null;
}

/** Preisverlauf eines Artikel-Lieferant-Links (append-only, KF3-31). */
export function PreisHistorieDialog({
  link,
  lieferantId,
  open,
  onOpenChange,
}: {
  link: { id: string; artikelnummer: string } | null;
  lieferantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useSWR(
    open && link ? `/api/lieferanten/${lieferantId}/artikel/${link.id}` : null,
    fetcher
  );
  const preise: PreisZeile[] = Array.isArray(data) ? data : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preisverlauf {link?.artikelnummer}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
        ) : preise.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">Keine Historie vorhanden.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gültig ab</TableHead>
                <TableHead className="text-right">Preis</TableHead>
                <TableHead>Quelle</TableHead>
                <TableHead>Von</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preise.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">
                    {new Date(p.gueltigAb).toLocaleDateString("de-DE")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{p.preis.toFixed(2)} €</TableCell>
                  <TableCell className="text-xs">{p.quelle ?? "–"}</TableCell>
                  <TableCell className="text-xs">{p.benutzer ? (p.benutzer.name || p.benutzer.username) : "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
