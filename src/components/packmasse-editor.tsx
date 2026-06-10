"use client";

import { useEffect, useState } from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Packmass {
  name: string;
  laenge: string;
  breite: string;
  hoehe: string;
  gewicht: string;
}

interface PackmassRow {
  name?: string | null;
  laenge?: number | null;
  breite?: number | null;
  hoehe?: number | null;
  gewicht?: number | null;
}

function zuZeile(p: PackmassRow): Packmass {
  return {
    name: p.name ?? "",
    laenge: p.laenge?.toString() ?? "",
    breite: p.breite?.toString() ?? "",
    hoehe: p.hoehe?.toString() ?? "",
    gewicht: p.gewicht?.toString() ?? "",
  };
}

/** Packmaße (Kisten/Kartons) eines Auftrags pflegen (V2: PUT /{id}/packmasse). */
export function PackmasseEditor({
  auftragId,
  packmasse,
  darfBearbeiten,
}: {
  auftragId: string;
  packmasse: PackmassRow[];
  darfBearbeiten: boolean;
}) {
  const [zeilen, setZeilen] = useState<Packmass[]>(packmasse.map(zuZeile));
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    setZeilen(packmasse.map(zuZeile));
  }, [packmasse]);

  function setFeld(i: number, feld: keyof Packmass, wert: string) {
    setZeilen((z) => z.map((zeile, j) => (j === i ? { ...zeile, [feld]: wert } : zeile)));
  }

  async function speichern() {
    setSpeichert(true);
    const res = await fetch(`/api/auftraege/${auftragId}/packmasse`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        zeilen.map((z) => ({
          name: z.name || null,
          laenge: z.laenge ? parseFloat(z.laenge) : null,
          breite: z.breite ? parseFloat(z.breite) : null,
          hoehe: z.hoehe ? parseFloat(z.hoehe) : null,
          gewicht: z.gewicht ? parseFloat(z.gewicht) : null,
        }))
      ),
    });
    const body = await res.json().catch(() => ({}));
    setSpeichert(false);
    if (!res.ok) { toast.error(body.error ?? "Speichern fehlgeschlagen"); return; }
    toast.success("Packmaße gespeichert");
    mutate(`/api/auftraege/${auftragId}`);
  }

  if (!darfBearbeiten && zeilen.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Keine Packmaße erfasst</p>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_repeat(4,5rem)_2rem] items-center gap-1 text-xs text-muted-foreground">
        <span>Behälter</span>
        <span>L (cm)</span>
        <span>B (cm)</span>
        <span>H (cm)</span>
        <span>kg</span>
        <span />
      </div>
      {zeilen.map((z, i) => (
        <div key={i} className="grid grid-cols-[1fr_repeat(4,5rem)_2rem] items-center gap-1">
          <Input
            className="h-8 text-sm"
            placeholder={`Karton ${i + 1}`}
            value={z.name}
            disabled={!darfBearbeiten}
            onChange={(e) => setFeld(i, "name", e.target.value)}
          />
          {(["laenge", "breite", "hoehe", "gewicht"] as const).map((feld) => (
            <Input
              key={feld}
              className="h-8 text-sm"
              type="number"
              min="0"
              step="any"
              value={z[feld]}
              disabled={!darfBearbeiten}
              onChange={(e) => setFeld(i, feld, e.target.value)}
            />
          ))}
          {darfBearbeiten && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-destructive"
              onClick={() => setZeilen((alt) => alt.filter((_, j) => j !== i))}
              aria-label="Zeile entfernen"
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      ))}
      {darfBearbeiten && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setZeilen((z) => [...z, { name: "", laenge: "", breite: "", hoehe: "", gewicht: "" }])}
          >
            <Plus className="size-3 mr-1" /> Behälter
          </Button>
          <Button size="sm" onClick={speichern} disabled={speichert}>
            Packmaße speichern
          </Button>
        </div>
      )}
    </div>
  );
}
