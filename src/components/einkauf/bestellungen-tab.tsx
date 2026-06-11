"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WareneingangDialog } from "@/components/einkauf/wareneingang-dialog";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface BestellPositionRow {
  id: string;
  posNr: number;
  artikelnummer: string;
  menge: number;
  preis: number | null;
  geliefert: number;
  rest: number;
  effektiverTermin: string | null;
  ampel: "rot" | "gelb" | "gruen";
  uebersteuerungsGrund?: string | null;
  artikel?: { bezeichnung: string; einheit: string };
}

export interface BestellungRow {
  id: string;
  nr: number;
  status: string;
  zugesagtTermin: string | null;
  bemerkung?: string | null;
  ampel: "rot" | "gelb" | "gruen";
  lieferant: { name: string };
  positionen: BestellPositionRow[];
}

const STATUS_LABEL: Record<string, string> = {
  angefragt: "Angefragt",
  bestellt: "Bestellt",
  teilgeliefert: "Teilgeliefert",
  abgeschlossen: "Abgeschlossen",
  storniert: "Storniert",
};

const AMPEL_CLASS: Record<string, string> = {
  rot: "bg-red-500",
  gelb: "bg-amber-400",
  gruen: "bg-green-500",
};

function fmtTermin(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("de-DE") : "–";
}

/** Offene-Bestellungen-Liste mit Überfälligkeits-Ampel + Detail (KF3-29/30). */
export function BestellungenTab() {
  const { hatRecht } = useMe();
  const darfBestellen = hatRecht("einkauf.bestellen");
  const darfBuchen = hatRecht("lager.buchen");

  const [filter, setFilter] = useState<"offen" | "alle">("offen");
  const key = `/api/einkauf/bestellungen?status=${filter}`;
  const { data, isLoading } = useSWR(key, fetcher, { refreshInterval: 30000 });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [weOffen, setWeOffen] = useState(false);

  const bestellungen: BestellungRow[] = Array.isArray(data) ? data : [];
  const detail = bestellungen.find((b) => b.id === detailId) ?? null;

  function neuLaden() {
    mutate(key);
    mutate("/api/einkauf/vorschlaege");
    mutate("/api/material/bestaende");
  }

  async function setStatus(b: BestellungRow, status: string) {
    const res = await fetch(`/api/einkauf/bestellungen/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Statusänderung fehlgeschlagen");
      return;
    }
    toast.success(`B-${b.nr}: ${STATUS_LABEL[status] ?? status}`);
    neuLaden();
  }

  async function setTermin(b: BestellungRow, datum: string) {
    const res = await fetch(`/api/einkauf/bestellungen/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zugesagtTermin: datum ? new Date(`${datum}T12:00:00`).toISOString() : null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Termin konnte nicht gespeichert werden");
      return;
    }
    toast.success(`B-${b.nr}: Termin ${datum ? new Date(datum).toLocaleDateString("de-DE") : "entfernt"}`);
    neuLaden();
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button size="sm" variant={filter === "offen" ? "default" : "outline"} onClick={() => setFilter("offen")}>
          Offene
        </Button>
        <Button size="sm" variant={filter === "alle" ? "default" : "outline"} onClick={() => setFilter("alle")}>
          Alle
        </Button>
      </div>

      {bestellungen.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Keine {filter === "offen" ? "offenen " : ""}Bestellungen.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr.</TableHead>
                  <TableHead>Lieferant</TableHead>
                  <TableHead>Zugesagt</TableHead>
                  <TableHead className="text-right">Positionen</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bestellungen.map((b) => {
                  const voll = b.positionen.filter((p) => p.rest <= 0).length;
                  return (
                    <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(b.id)}>
                      <TableCell className="font-mono font-medium">
                        <span className="flex items-center gap-2">
                          <span className={`size-2.5 shrink-0 rounded-full ${AMPEL_CLASS[b.ampel]}`} />
                          B-{b.nr}
                        </span>
                      </TableCell>
                      <TableCell>{b.lieferant.name}</TableCell>
                      <TableCell className="text-sm">{fmtTermin(b.zugesagtTermin)}</TableCell>
                      <TableCell className="text-right text-sm">{voll}/{b.positionen.length} geliefert</TableCell>
                      <TableCell>
                        <Badge variant={b.status === "storniert" ? "destructive" : b.status === "abgeschlossen" ? "outline" : "secondary"}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Detail-Sheet ─────────────────────────────────────── */}
      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) { setDetailId(null); setWeOffen(false); } }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {detail && (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle className="flex items-center gap-2 font-mono text-lg">
                  <span className={`size-2.5 rounded-full ${AMPEL_CLASS[detail.ampel]}`} />
                  B-{detail.nr}
                  <span className="font-sans text-sm font-normal text-muted-foreground">{detail.lieferant.name}</span>
                </SheetTitle>
              </SheetHeader>

              <div className="flex flex-wrap items-center gap-2 py-2">
                {darfBestellen ? (
                  <Select value={detail.status} onValueChange={(v) => setStatus(detail, v)}>
                    <SelectTrigger className="h-8 w-44 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{STATUS_LABEL[detail.status]}</Badge>
                )}
                {darfBestellen ? (
                  <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    Zugesagt:
                    <Input
                      type="date"
                      className="h-8 w-36"
                      value={detail.zugesagtTermin?.slice(0, 10) ?? ""}
                      onChange={(e) => setTermin(detail, e.target.value)}
                      aria-label="Zugesagter Termin"
                    />
                  </label>
                ) : (
                  <span className="text-sm text-muted-foreground">Zugesagt: {fmtTermin(detail.zugesagtTermin)}</span>
                )}
                <span className="flex-1" />
                {darfBuchen && ["bestellt", "teilgeliefert"].includes(detail.status) && (
                  <Button size="sm" onClick={() => setWeOffen(true)}>
                    <PackageCheck className="size-4 mr-1" /> Wareneingang
                  </Button>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artikel</TableHead>
                    <TableHead className="text-right">Bestellt</TableHead>
                    <TableHead className="text-right">Geliefert</TableHead>
                    <TableHead className="text-right">Rest</TableHead>
                    <TableHead>Termin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.positionen.map((p) => (
                    <TableRow key={p.id} className={p.rest <= 0 ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="font-mono text-xs">{p.artikelnummer}</div>
                        <div className="text-xs text-muted-foreground">{p.artikel?.bezeichnung}</div>
                        {p.uebersteuerungsGrund && (
                          <div className="text-[10px] text-muted-foreground italic">Übersteuert: {p.uebersteuerungsGrund}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{p.menge}</TableCell>
                      <TableCell className="text-right font-mono">{p.geliefert}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{p.rest}</TableCell>
                      <TableCell className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className={`size-2 rounded-full ${AMPEL_CLASS[p.ampel]}`} />
                          {fmtTermin(p.effektiverTermin)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {detail.bemerkung && (
                <p className="mt-3 rounded bg-muted p-2 text-xs">{detail.bemerkung}</p>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <WareneingangDialog
        // Remount je Bestellung: Zeilen-/Lagerort-State darf nicht in den
        // Dialog einer anderen Bestellung „mitwandern“
        key={detail?.id ?? "keine"}
        bestellung={detail}
        open={weOffen && !!detail}
        onOpenChange={setWeOffen}
        onDone={() => {
          neuLaden();
          setWeOffen(false);
        }}
      />
    </div>
  );
}
