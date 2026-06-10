"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { LogIn, LogOut, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ArbeitsvorratBucket } from "@/components/arbeitsvorrat-bucket";
import { useMe } from "@/hooks/use-me";
import { formatDuration, formatDateTime } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function elapsedSeconds(start: string, end?: string | null) {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.round((e - s) / 1000);
}

/** Date/ISO → "YYYY-MM-DDTHH:mm" für <input type="datetime-local"> (lokale Zeit). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ZeitEintrag {
  id: string;
  mitarbeiterId: string;
  auftragId: string;
  mitarbeiter: { name: string; kuerzel: string };
  auftrag: { nummer: string };
  start: string;
  ende?: string | null;
  kategorieId?: string | null;
}

export default function ZeitenPage() {
  const { hatRecht } = useMe();
  const darfKorrigieren = hatRecht("zeiten.fremde");

  const [mitarbeiterId, setMitarbeiterId] = useState("");
  const [auftragId, setAuftragId] = useState("");
  const [editZeit, setEditZeit] = useState<ZeitEintrag | null>(null);
  const [editForm, setEditForm] = useState({ start: "", ende: "", kategorieId: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: mitarbeiter } = useSWR("/api/mitarbeiter", fetcher);
  const { data: auftraege } = useSWR("/api/auftraege?status=laeuft", fetcher);
  const { data: kategorien } = useSWR("/api/zeitkategorien", fetcher);
  const { data: zeiten, isLoading } = useSWR("/api/zeiten?offen=false", fetcher, {
    refreshInterval: 15000,
  });
  const { data: offene } = useSWR("/api/zeiten?offen=true", fetcher, {
    refreshInterval: 10000,
  });

  async function anmelden() {
    if (!mitarbeiterId || !auftragId) {
      toast.error("Mitarbeiter und Auftrag auswählen");
      return;
    }
    const res = await fetch("/api/zeiten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "anmelden", mitarbeiterId, auftragId }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Fehler");
      return;
    }
    toast.success("Angemeldet");
    mutate("/api/zeiten?offen=true");
  }

  async function abmelden(mId: string, aId: string) {
    const res = await fetch("/api/zeiten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abmelden", mitarbeiterId: mId, auftragId: aId }),
    });
    if (!res.ok) {
      toast.error("Fehler beim Abmelden");
      return;
    }
    toast.success("Abgemeldet");
    mutate("/api/zeiten?offen=true");
    mutate("/api/zeiten?offen=false");
  }

  function openEdit(z: ZeitEintrag) {
    setEditZeit(z);
    setEditForm({
      start: toLocalInput(z.start),
      ende: toLocalInput(z.ende),
      kategorieId: z.kategorieId ?? "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editZeit) return;
    const payload: Record<string, unknown> = {
      start: new Date(editForm.start).toISOString(),
      ende: editForm.ende ? new Date(editForm.ende).toISOString() : null,
      kategorieId: editForm.kategorieId || null,
    };
    const res = await fetch(`/api/zeiten/${editZeit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Fehler");
      return;
    }
    toast.success("Buchung aktualisiert");
    setEditZeit(null);
    mutate("/api/zeiten?offen=false");
    mutate("/api/zeiten?offen=true");
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/zeiten/${deleteId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Fehler beim Löschen");
      return;
    }
    toast.success("Buchung gelöscht");
    setDeleteId(null);
    mutate("/api/zeiten?offen=false");
    mutate("/api/zeiten?offen=true");
  }

  const laufendeZeiten: ZeitEintrag[] = Array.isArray(offene) ? offene : [];
  const zeitenListe: ZeitEintrag[] = Array.isArray(zeiten) ? zeiten.slice(0, 50) : [];
  const kategorieListe = Array.isArray(kategorien) ? kategorien : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Zeiterfassung</h1>

      <ArbeitsvorratBucket />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Für andere buchen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={mitarbeiterId} onValueChange={setMitarbeiterId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Mitarbeiter wählen…" />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(mitarbeiter) ? mitarbeiter : []).map(
                  (m: { id: string; name: string; kuerzel: string }) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.kuerzel} – {m.name}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Select value={auftragId} onValueChange={setAuftragId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Auftrag wählen…" />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(auftraege) ? auftraege : []).map(
                  (a: { id: string; nummer: string; bezeichnung: string }) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nummer} – {a.bezeichnung}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Button onClick={anmelden} className="w-full h-11">
              <LogIn className="size-4 mr-2" />
              Anmelden
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Aktive Buchungen ({laufendeZeiten.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {laufendeZeiten.length === 0 && (
              <p className="text-sm text-muted-foreground">Niemand angemeldet</p>
            )}
            {laufendeZeiten.map((z) => (
              <div
                key={z.id}
                className="flex items-center justify-between rounded-md border px-3 py-3"
              >
                <div>
                  <span className="font-medium">{z.mitarbeiter.kuerzel}</span>
                  <span className="text-muted-foreground mx-2">→</span>
                  <span className="font-mono text-sm">{z.auftrag.nummer}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{formatDuration(elapsedSeconds(z.start))}</Badge>
                  <Button
                    variant="outline"
                    onClick={() => abmelden(z.mitarbeiterId, z.auftragId)}
                  >
                    <LogOut className="size-4 mr-1" />
                    Abmelden
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Letzte 50 Buchungen</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead>Auftrag</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Ende</TableHead>
                  <TableHead>Dauer</TableHead>
                  {darfKorrigieren && <TableHead className="text-right">Aktion</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? [...Array(5)].map((_, i) => (
                      <TableRow key={i}>
                        {[...Array(darfKorrigieren ? 6 : 5)].map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : zeitenListe.map((z) => (
                      <TableRow key={z.id}>
                        <TableCell>
                          {z.mitarbeiter.kuerzel} – {z.mitarbeiter.name}
                        </TableCell>
                        <TableCell className="font-mono">{z.auftrag.nummer}</TableCell>
                        <TableCell className="text-sm">{formatDateTime(z.start)}</TableCell>
                        <TableCell className="text-sm">
                          {z.ende ? formatDateTime(z.ende) : "–"}
                        </TableCell>
                        <TableCell>
                          {z.ende ? formatDuration(elapsedSeconds(z.start, z.ende)) : "läuft…"}
                        </TableCell>
                        {darfKorrigieren && (
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(z)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(z.id)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Buchung bearbeiten ─────────────────────────────── */}
      <Dialog open={!!editZeit} onOpenChange={(o) => { if (!o) setEditZeit(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buchung bearbeiten</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Start *</Label>
              <Input
                type="datetime-local"
                required
                value={editForm.start}
                onChange={(e) => setEditForm({ ...editForm, start: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ende (leer = läuft noch)</Label>
              <Input
                type="datetime-local"
                value={editForm.ende}
                onChange={(e) => setEditForm({ ...editForm, ende: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kategorie</Label>
              <Select
                value={editForm.kategorieId || "none"}
                onValueChange={(v) => setEditForm({ ...editForm, kategorieId: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Keine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine</SelectItem>
                  {kategorieListe.map((k: { id: string; name: string }) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditZeit(null)}>
                Abbrechen
              </Button>
              <Button type="submit">Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Buchung löschen?"
        description="Die Zeitbuchung wird dauerhaft entfernt. Das kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
