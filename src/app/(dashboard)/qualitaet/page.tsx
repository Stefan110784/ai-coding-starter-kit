"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useMe } from "@/hooks/use-me";
import { formatDateTime } from "@/lib/utils";
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
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function QualitaetPage() {
  const { hatRecht } = useMe();
  const darfLoeschen = hatRecht("qualitaet.loeschen");

  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    auftragId: "",
    mitarbeiterId: "",
    gut: "",
    ausschuss: "",
    nacharbeit: "",
    bemerkung: "",
  });

  const { data: qualitaet, isLoading } = useSWR("/api/qualitaet", fetcher, {
    refreshInterval: 30000,
  });
  const { data: auftraege } = useSWR("/api/auftraege", fetcher);
  const { data: mitarbeiter } = useSWR("/api/mitarbeiter", fetcher);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/qualitaet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auftragId: form.auftragId,
        mitarbeiterId: form.mitarbeiterId || undefined,
        gut: parseFloat(form.gut) || 0,
        ausschuss: parseFloat(form.ausschuss) || 0,
        nacharbeit: parseFloat(form.nacharbeit) || 0,
        bemerkung: form.bemerkung || undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Fehler");
      return;
    }
    toast.success("Qualitätseintrag gespeichert");
    setShowCreate(false);
    setForm({ auftragId: "", mitarbeiterId: "", gut: "", ausschuss: "", nacharbeit: "", bemerkung: "" });
    mutate("/api/qualitaet");
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/qualitaet/${deleteId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Fehler beim Löschen");
      return;
    }
    toast.success("Eintrag gelöscht");
    setDeleteId(null);
    mutate("/api/qualitaet");
  }

  const eintraege = Array.isArray(qualitaet) ? qualitaet : [];
  const gesamtGut = eintraege.reduce((s: number, q: { gut: number }) => s + q.gut, 0);
  const gesamtAusschuss = eintraege.reduce((s: number, q: { ausschuss: number }) => s + q.ausschuss, 0);
  const gesamtNacharbeit = eintraege.reduce((s: number, q: { nacharbeit: number }) => s + q.nacharbeit, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Qualitätskontrolle</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" />
          Eintrag erfassen
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Gut</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-500">{gesamtGut}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Nacharbeit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-500">{gesamtNacharbeit}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Ausschuss</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-500">{gesamtAusschuss}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeitstempel</TableHead>
                  <TableHead>Auftrag</TableHead>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead className="text-right">Gut</TableHead>
                  <TableHead className="text-right">Nacharbeit</TableHead>
                  <TableHead className="text-right">Ausschuss</TableHead>
                  <TableHead>Bemerkung</TableHead>
                  {darfLoeschen && <TableHead className="text-right">Aktion</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? [...Array(5)].map((_, i) => (
                      <TableRow key={i}>
                        {[...Array(darfLoeschen ? 8 : 7)].map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : eintraege.map((q: {
                      id: string;
                      zeitstempel: string;
                      auftrag: { nummer: string };
                      mitarbeiter?: { kuerzel: string };
                      gut: number;
                      nacharbeit: number;
                      ausschuss: number;
                      bemerkung?: string;
                    }) => (
                      <TableRow key={q.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDateTime(q.zeitstempel)}
                        </TableCell>
                        <TableCell className="font-mono">{q.auftrag.nummer}</TableCell>
                        <TableCell>{q.mitarbeiter?.kuerzel ?? "–"}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">{q.gut}</TableCell>
                        <TableCell className="text-right text-yellow-600 font-medium">{q.nacharbeit}</TableCell>
                        <TableCell className="text-right text-red-600 font-medium">{q.ausschuss}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{q.bemerkung ?? "–"}</TableCell>
                        {darfLoeschen && (
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => setDeleteId(q.id)}>
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Qualitätseintrag erfassen</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Auftrag *</Label>
              <Select value={form.auftragId} onValueChange={(v) => setForm({ ...form, auftragId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Auftrag wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(auftraege) ? auftraege : []).map((a: { id: string; nummer: string; bezeichnung: string }) => (
                    <SelectItem key={a.id} value={a.id}>{a.nummer} – {a.bezeichnung}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mitarbeiter</Label>
              <Select value={form.mitarbeiterId} onValueChange={(v) => setForm({ ...form, mitarbeiterId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional…" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(mitarbeiter) ? mitarbeiter : []).map((m: { id: string; kuerzel: string; name: string }) => (
                    <SelectItem key={m.id} value={m.id}>{m.kuerzel} – {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Gut</Label>
                <Input type="number" min="0" step="any" value={form.gut} onChange={(e) => setForm({ ...form, gut: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nacharbeit</Label>
                <Input type="number" min="0" step="any" value={form.nacharbeit} onChange={(e) => setForm({ ...form, nacharbeit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Ausschuss</Label>
                <Input type="number" min="0" step="any" value={form.ausschuss} onChange={(e) => setForm({ ...form, ausschuss: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bemerkung</Label>
              <Textarea value={form.bemerkung} onChange={(e) => setForm({ ...form, bemerkung: e.target.value })} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
              <Button type="submit">Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Qualitätseintrag löschen?"
        description="Der Eintrag wird dauerhaft entfernt und fließt nicht mehr in die Auswertung ein."
        confirmLabel="Löschen"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
