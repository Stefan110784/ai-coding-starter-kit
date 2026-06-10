"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Kante {
  id: string;
  parentArtikel: string;
  kindArtikel: string;
  bezeichnung: string;
  menge: number;
  einheit: string;
  posNr: number;
  ebene: number;
}

/** Stücklisten-Pflege im Artikel-Sheet: Baumansicht + Hinzufügen/Löschen (Recht verwaltung). */
export function StuecklisteEditor({
  artikelnummer,
  darfVerwalten,
  onNavigate,
}: {
  artikelnummer: string;
  darfVerwalten: boolean;
  onNavigate?: (artikelnummer: string) => void;
}) {
  const key = `/api/stueckliste/${encodeURIComponent(artikelnummer)}/baum`;
  const { data, isLoading } = useSWR(key, fetcher);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ kindArtikel: "", menge: "1", einheit: "" });
  const [loeschKante, setLoeschKante] = useState<Kante | null>(null);

  // Vorschläge für die Kind-Artikel-Eingabe
  const { data: vorschlaege } = useSWR(
    showForm && form.kindArtikel.length >= 2
      ? `/api/artikel?q=${encodeURIComponent(form.kindArtikel)}`
      : null,
    fetcher
  );

  const kanten: Kante[] = Array.isArray(data?.kanten) ? data.kanten : [];
  // Tiefensuche-Reihenfolge für die eingerückte Anzeige herstellen
  const sortiert = baumReihenfolge(kanten, artikelnummer);

  async function hinzufuegen(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/stueckliste/${encodeURIComponent(artikelnummer)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kindArtikel: form.kindArtikel.trim(),
        menge: parseFloat(form.menge),
        ...(form.einheit ? { einheit: form.einheit } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Fehler beim Hinzufügen"); return; }
    toast.success("Position hinzugefügt");
    setForm({ kindArtikel: "", menge: "1", einheit: "" });
    setShowForm(false);
    mutate(key);
    mutate(`/api/artikel/${encodeURIComponent(artikelnummer)}`);
  }

  async function loeschen() {
    if (!loeschKante) return;
    const res = await fetch(
      `/api/stueckliste/${encodeURIComponent(loeschKante.parentArtikel)}/${loeschKante.id}`,
      { method: "DELETE" }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error ?? "Fehler beim Löschen"); return; }
    toast.success("Position entfernt");
    setLoeschKante(null);
    mutate(key);
    mutate(`/api/artikel/${encodeURIComponent(artikelnummer)}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Stückliste ({sortiert.filter((k) => k.ebene === 1).length} Positionen)
        </h3>
        {darfVerwalten && !showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="size-3 mr-1" /> Position
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={hinzufuegen} className="space-y-2 rounded border p-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Kind-Artikel *</Label>
            <Input
              required
              list="stueckliste-artikel-vorschlaege"
              placeholder="Artikelnummer…"
              value={form.kindArtikel}
              onChange={(e) => setForm({ ...form, kindArtikel: e.target.value })}
            />
            <datalist id="stueckliste-artikel-vorschlaege">
              {(Array.isArray(vorschlaege) ? vorschlaege : []).slice(0, 50).map(
                (a: { artikelnummer: string; bezeichnung: string }) => (
                  <option key={a.artikelnummer} value={a.artikelnummer}>
                    {a.bezeichnung}
                  </option>
                )
              )}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Menge *</Label>
              <Input required type="number" min="0.001" step="any" value={form.menge}
                onChange={(e) => setForm({ ...form, menge: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Einheit</Label>
              <Input placeholder="aus Artikel" value={form.einheit}
                onChange={(e) => setForm({ ...form, einheit: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">Hinzufügen</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
          </div>
        </form>
      )}

      {sortiert.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Stücklisten-Positionen</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artikel</TableHead>
              <TableHead>Bezeichnung</TableHead>
              <TableHead className="text-right">Menge</TableHead>
              {darfVerwalten && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortiert.map((k) => (
              <TableRow key={k.id}>
                <TableCell
                  className="cursor-pointer font-mono text-xs"
                  style={{ paddingLeft: `${0.5 + (k.ebene - 1) * 1.25}rem` }}
                  onClick={() => onNavigate?.(k.kindArtikel)}
                >
                  {k.kindArtikel}
                </TableCell>
                <TableCell className="text-xs">{k.bezeichnung}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {k.menge} {k.einheit}
                </TableCell>
                {darfVerwalten && (
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 text-destructive"
                      onClick={() => setLoeschKante(k)}
                      aria-label="Position löschen"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={!!loeschKante}
        onOpenChange={(o) => { if (!o) setLoeschKante(null); }}
        title="Stücklisten-Position löschen?"
        description={`"${loeschKante?.kindArtikel}" wird aus der Stückliste von "${loeschKante?.parentArtikel}" entfernt. Unterpositionen bleiben am Kind-Artikel erhalten.`}
        confirmLabel="Löschen"
        onConfirm={loeschen}
      />
    </div>
  );
}

/** Bringt die BFS-Kantenliste in Tiefensuche-Reihenfolge für die Einrückung. */
function baumReihenfolge(kanten: Kante[], root: string): Kante[] {
  const proParent = new Map<string, Kante[]>();
  for (const k of kanten) {
    const liste = proParent.get(k.parentArtikel) ?? [];
    liste.push(k);
    proParent.set(k.parentArtikel, liste);
  }
  const ergebnis: Kante[] = [];
  function dfs(parent: string, pfad: Set<string>) {
    for (const k of proParent.get(parent) ?? []) {
      if (pfad.has(k.kindArtikel)) continue;
      ergebnis.push(k);
      dfs(k.kindArtikel, new Set(pfad).add(k.kindArtikel));
    }
  }
  dfs(root, new Set([root]));
  return ergebnis;
}
