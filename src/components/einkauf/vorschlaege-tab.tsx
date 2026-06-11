"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Vorschlag {
  artikelnummer: string;
  bezeichnung: string;
  einheit: string;
  bestand: number;
  offenBestellt: number;
  verfuegbar: number;
  mindestbestand: number;
  vorschlagsmenge: number;
  lieferant: { lieferantId: string; name: string; einkaufspreis: number; lieferzeitTage: number } | null;
}

/** Bestellvorschläge: Meldebestand + EOQ → Bestellung je Lieferant (KF3-29). */
export function VorschlaegeTab() {
  const { hatRecht } = useMe();
  const darfBestellen = hatRecht("einkauf.bestellen");
  const { data, isLoading } = useSWR("/api/einkauf/vorschlaege", fetcher);

  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [mengen, setMengen] = useState<Record<string, string>>({});
  const [termin, setTermin] = useState(""); // zugesagter Termin (Kopf, optional)
  const [grundDialog, setGrundDialog] = useState(false);
  const [grund, setGrund] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const vorschlaege: Vorschlag[] = Array.isArray(data) ? data : [];

  function toggle(nr: string) {
    setGewaehlt((s) => {
      const neu = new Set(s);
      if (neu.has(nr)) neu.delete(nr);
      else neu.add(nr);
      return neu;
    });
  }

  function effektiveMenge(v: Vorschlag): number {
    const eingabe = mengen[v.artikelnummer];
    const n = eingabe !== undefined ? parseFloat(eingabe) : v.vorschlagsmenge;
    return Number.isFinite(n) && n > 0 ? n : v.vorschlagsmenge;
  }

  const ausgewaehlte = vorschlaege.filter((v) => gewaehlt.has(v.artikelnummer));
  const brauchtGrund = ausgewaehlte.some((v) => effektiveMenge(v) !== v.vorschlagsmenge);

  async function bestellen(begruendung?: string) {
    const ohneLieferant = ausgewaehlte.filter((v) => !v.lieferant);
    if (ohneLieferant.length > 0) {
      toast.error(`Kein Lieferant gepflegt: ${ohneLieferant.map((v) => v.artikelnummer).join(", ")}`);
      return;
    }
    setLaeuft(true);
    try {
      // Eine Bestellung je Lieferant (Anforderung Kap. 3)
      const gruppen = new Map<string, Vorschlag[]>();
      for (const v of ausgewaehlte) {
        const key = v.lieferant!.lieferantId;
        gruppen.set(key, [...(gruppen.get(key) ?? []), v]);
      }
      // Teilfehlschläge dürfen kein Doppelbestellungs-Risiko erzeugen:
      // erfolgreiche Lieferanten sofort aus der Auswahl nehmen, Fehler sammeln.
      const fehler: string[] = [];
      let erfolgreich = 0;
      for (const [lieferantId, liste] of gruppen) {
        const res = await fetch("/api/einkauf/bestellungen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lieferantId,
            ...(termin ? { zugesagtTermin: new Date(`${termin}T12:00:00`).toISOString() } : {}),
            positionen: liste.map((v) => ({
              artikelnummer: v.artikelnummer,
              menge: effektiveMenge(v),
              preis: v.lieferant!.einkaufspreis,
              vorschlagsmenge: v.vorschlagsmenge,
              ...(effektiveMenge(v) !== v.vorschlagsmenge ? { uebersteuerungsGrund: begruendung } : {}),
            })),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          fehler.push(`${liste[0].lieferant!.name}: ${body.error ?? "Bestellung fehlgeschlagen"}`);
          continue;
        }
        erfolgreich++;
        setGewaehlt((s) => {
          const neu = new Set(s);
          liste.forEach((v) => neu.delete(v.artikelnummer));
          return neu;
        });
        toast.success(`Bestellung B-${body.nr} (${liste[0].lieferant!.name}) angelegt`);
      }
      if (fehler.length > 0) toast.error(fehler.join(" · "));
      if (erfolgreich > 0) {
        mutate("/api/einkauf/vorschlaege");
        mutate((key) => typeof key === "string" && key.startsWith("/api/einkauf/bestellungen"));
      }
      if (fehler.length === 0) {
        setMengen({});
        setGrund("");
        setTermin("");
      }
    } finally {
      setLaeuft(false);
      setGrundDialog(false);
    }
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  }

  if (vorschlaege.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Keine Vorschläge — alle Artikel mit Mindestbestand sind ausreichend verfügbar (Bestand + offene Bestellungen).
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {vorschlaege.length} Artikel unter Meldebestand · Vorschlagsmenge = max(EOQ, Mindestmenge, Lücke)
        </p>
        {darfBestellen && (
          <div className="flex items-center gap-2">
            <Label htmlFor="vorschlag-termin" className="text-xs text-muted-foreground">
              Zugesagter Termin
            </Label>
            <Input
              id="vorschlag-termin"
              type="date"
              className="h-9 w-36"
              value={termin}
              onChange={(e) => setTermin(e.target.value)}
            />
            <Button
              disabled={ausgewaehlte.length === 0 || laeuft}
              onClick={() => (brauchtGrund ? setGrundDialog(true) : bestellen())}
            >
              <ShoppingCart className="size-4 mr-2" />
              Bestellung erzeugen ({ausgewaehlte.length})
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {darfBestellen && <TableHead className="w-10" />}
                <TableHead>Artikel</TableHead>
                <TableHead className="text-right">Bestand</TableHead>
                <TableHead className="text-right">Offen bestellt</TableHead>
                <TableHead className="text-right">Meldebestand</TableHead>
                <TableHead className="text-right">Vorschlag</TableHead>
                <TableHead className="w-28 text-right">Menge</TableHead>
                <TableHead>Lieferant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vorschlaege.map((v) => (
                <TableRow key={v.artikelnummer}>
                  {darfBestellen && (
                    <TableCell>
                      <Checkbox
                        checked={gewaehlt.has(v.artikelnummer)}
                        onCheckedChange={() => toggle(v.artikelnummer)}
                        aria-label={`${v.artikelnummer} auswählen`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="font-mono text-xs">{v.artikelnummer}</div>
                    <div className="text-xs text-muted-foreground">{v.bezeichnung}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{v.bestand}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{v.offenBestellt}</TableCell>
                  <TableCell className="text-right font-mono">{v.mindestbestand}</TableCell>
                  <TableCell className="text-right font-mono">{v.vorschlagsmenge}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      step="any"
                      className="h-8 text-right"
                      value={mengen[v.artikelnummer] ?? String(v.vorschlagsmenge)}
                      onChange={(e) => setMengen({ ...mengen, [v.artikelnummer]: e.target.value })}
                      disabled={!darfBestellen}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    {v.lieferant ? (
                      <>
                        {v.lieferant.name}
                        <span className="text-muted-foreground"> · {v.lieferant.einkaufspreis.toFixed(2)} € · {v.lieferant.lieferzeitTage} Tage</span>
                      </>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">kein Lieferant</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Begründung bei EOQ-Übersteuerung (Anforderung Kap. 3) */}
      <Dialog open={grundDialog} onOpenChange={setGrundDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Abweichung vom Vorschlag begründen</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Begründung *</Label>
            <Textarea rows={2} value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="z. B. Staffelpreis, Sammelbestellung, Projektbedarf…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrundDialog(false)}>Abbrechen</Button>
            <Button disabled={!grund.trim() || laeuft} onClick={() => bestellen(grund.trim())}>
              Bestellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
