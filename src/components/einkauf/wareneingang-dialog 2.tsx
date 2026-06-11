"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScanButton } from "@/components/scan-input";
import type { BestellungRow } from "@/components/einkauf/bestellungen-tab";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ZeilenState {
  aktiv: boolean;
  menge: string;
  pruefErgebnis: "ok" | "abweichend";
  pruefBemerkung: string;
}

interface WareneingangDialogProps {
  bestellung: BestellungRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * Wareneingang gegen Bestellung — tablet-first (KF3-30): Restmengen vorbelegt,
 * Eingangsprüfung ok/abweichend je Position, Artikel-Scan markiert die Zeile.
 */
export function WareneingangDialog({ bestellung, open, onOpenChange, onDone }: WareneingangDialogProps) {
  const { data: lagerorte } = useSWR(open ? "/api/material/lagerorte" : null, fetcher);
  const [lagerortId, setLagerortId] = useState("");
  const [zeilen, setZeilen] = useState<Record<string, ZeilenState>>({});
  const [laeuft, setLaeuft] = useState(false);

  const offene = (bestellung?.positionen ?? []).filter((p) => p.rest > 0);
  const lagerortListe: Array<{ id: string; name: string; aktiv: boolean }> = Array.isArray(lagerorte) ? lagerorte : [];

  function zeile(id: string, rest: number): ZeilenState {
    return zeilen[id] ?? { aktiv: true, menge: String(rest), pruefErgebnis: "ok", pruefBemerkung: "" };
  }

  function setZeile(id: string, rest: number, patch: Partial<ZeilenState>) {
    setZeilen((s) => ({ ...s, [id]: { ...zeile(id, rest), ...patch } }));
  }

  async function buchen(ueberlieferungBestaetigt = false) {
    if (!bestellung) return;
    if (!lagerortId) {
      toast.error("Lagerort wählen");
      return;
    }
    const positionen = offene
      .filter((p) => zeile(p.id, p.rest).aktiv)
      .map((p) => {
        const z = zeile(p.id, p.rest);
        return {
          bestellPositionId: p.id,
          menge: parseFloat(z.menge),
          lagerortId,
          pruefErgebnis: z.pruefErgebnis,
          ...(z.pruefBemerkung.trim() ? { pruefBemerkung: z.pruefBemerkung.trim() } : {}),
        };
      });
    if (positionen.length === 0) {
      toast.error("Keine Position ausgewählt");
      return;
    }
    if (positionen.some((p) => !Number.isFinite(p.menge) || p.menge <= 0)) {
      toast.error("Ungültige Menge");
      return;
    }

    setLaeuft(true);
    try {
      const res = await fetch(`/api/einkauf/bestellungen/${bestellung.id}/wareneingang`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionen, ueberlieferungBestaetigt }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.ueberliefert) {
        const liste = (body.ueberliefert as Array<{ artikelnummer: string; bestellt: number; wuerde: number }>)
          .map((u) => `${u.artikelnummer} (${u.wuerde} statt ${u.bestellt})`)
          .join(", ");
        if (window.confirm(`Überlieferung: ${liste}. Trotzdem buchen?`)) {
          await buchen(true);
        }
        return;
      }
      if (!res.ok) {
        toast.error(body.error ?? "Wareneingang fehlgeschlagen");
        return;
      }
      toast.success(
        `Wareneingang gebucht (${body.bewegungen} Position${body.bewegungen === 1 ? "" : "en"})` +
          (body.status === "abgeschlossen" ? " — Bestellung abgeschlossen" : "")
      );
      setZeilen({});
      onDone();
    } finally {
      setLaeuft(false);
    }
  }

  return (
    // Beim Schließen Zeilen-State verwerfen — ein erneutes Öffnen startet
    // wieder mit den aktuellen Restmengen (zusätzlich remountet der Parent per key)
    <Dialog open={open} onOpenChange={(o) => { if (!o) setZeilen({}); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Wareneingang B-{bestellung?.nr}</DialogTitle>
          <DialogDescription>
            Restmengen sind vorbelegt; Eingangsprüfung je Position (ISO 8.4). Bei „abweichend“
            entsteht automatisch eine Lieferanten-Reklamation — Buchung auf das Sperrlager empfohlen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Lagerort *</Label>
            <Select value={lagerortId} onValueChange={setLagerortId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Lagerort wählen…" />
              </SelectTrigger>
              <SelectContent>
                {lagerortListe.filter((l) => l.aktiv).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ScanButton
            className="h-10 w-10"
            title="Artikel scannen"
            onScan={(code) => {
              const p = offene.find((o) => o.artikelnummer.toLowerCase() === code.toLowerCase());
              if (!p) {
                toast.error(`Artikel „${code}" ist keine offene Position dieser Bestellung`);
                return;
              }
              setZeile(p.id, p.rest, { aktiv: true });
              toast.success(`${p.artikelnummer} markiert (Rest ${p.rest})`);
            }}
          />
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {offene.map((p) => {
            const z = zeile(p.id, p.rest);
            return (
              <div key={p.id} className={`rounded-md border p-2.5 ${z.aktiv ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={z.aktiv}
                    onCheckedChange={(c) => setZeile(p.id, p.rest, { aktiv: c === true })}
                    aria-label={`${p.artikelnummer} buchen`}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-sm">{p.artikelnummer}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{p.artikel?.bezeichnung}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">Rest {p.rest}</Badge>
                  <Input
                    type="number"
                    min="0.001"
                    step="any"
                    className="h-9 w-24 text-right"
                    value={z.menge}
                    onChange={(e) => setZeile(p.id, p.rest, { menge: e.target.value })}
                    disabled={!z.aktiv}
                    aria-label={`Menge ${p.artikelnummer}`}
                  />
                  <Select
                    value={z.pruefErgebnis}
                    onValueChange={(v) => setZeile(p.id, p.rest, { pruefErgebnis: v as "ok" | "abweichend" })}
                    disabled={!z.aktiv}
                  >
                    <SelectTrigger className="h-9 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ok">Prüfung ok</SelectItem>
                      <SelectItem value="abweichend">Abweichend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {z.aktiv && z.pruefErgebnis === "abweichend" && (
                  <Input
                    className="mt-2 h-9"
                    placeholder="Prüfbefund (Pflicht) — z. B. Transportschaden, falsche Ausführung…"
                    value={z.pruefBemerkung}
                    onChange={(e) => setZeile(p.id, p.rest, { pruefBemerkung: e.target.value })}
                  />
                )}
              </div>
            );
          })}
          {offene.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Alle Positionen sind voll geliefert.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button disabled={laeuft || offene.length === 0} onClick={() => buchen()}>
            Wareneingang buchen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
