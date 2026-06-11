"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export const ABWEICHUNG_TYP_LABEL: Record<string, string> = {
  nacharbeit: "Nacharbeit",
  ausschuss: "Ausschuss",
  reklamationKunde: "Reklamation (Kunde)",
  reklamationLieferant: "Reklamation (Lieferant)",
};

const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  inBearbeitung: "In Bearbeitung",
  abgeschlossen: "Abgeschlossen",
};

interface Abweichung {
  id: string;
  typ: string;
  status: string;
  beschreibung: string;
  ursache?: string | null;
  massnahme?: string | null;
  grund?: { id: string; name: string } | null;
  verantwortlich?: { id: string; name: string; kuerzel: string } | null;
  faelligAm?: string | null;
  erfasstAm: string;
  erfasstVon?: { username: string; name?: string | null } | null;
}

interface FormState {
  typ: string;
  beschreibung: string;
  ursache: string;
  massnahme: string;
  grundId: string;
  verantwortlichId: string;
  faelligAm: string; // yyyy-mm-dd
}

const LEERES_FORMULAR: FormState = {
  typ: "nacharbeit",
  beschreibung: "",
  ursache: "",
  massnahme: "",
  grundId: "",
  verantwortlichId: "",
  faelligAm: "",
};

/** Abweichungen mit Ursache/Maßnahme am Auftrag (Minimal-CAPA, KF3-27). */
export function AbweichungBlock({ auftragId }: { auftragId: string }) {
  const key = `/api/abweichungen?auftragId=${auftragId}`;
  const { data, isLoading } = useSWR(key, fetcher);
  const { data: gruende } = useSWR("/api/abweichungen/gruende", fetcher);
  const { data: mitarbeiter } = useSWR("/api/mitarbeiter", fetcher);

  const [dialogOffen, setDialogOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(LEERES_FORMULAR);

  const abweichungen: Abweichung[] = Array.isArray(data) ? data : [];
  const grundListe = Array.isArray(gruende) ? gruende : [];
  const mitarbeiterListe = Array.isArray(mitarbeiter) ? mitarbeiter : [];

  function openNeu() {
    setEditId(null);
    setForm(LEERES_FORMULAR);
    setDialogOffen(true);
  }

  function openEdit(a: Abweichung) {
    setEditId(a.id);
    setForm({
      typ: a.typ,
      beschreibung: a.beschreibung,
      ursache: a.ursache ?? "",
      massnahme: a.massnahme ?? "",
      grundId: a.grund?.id ?? "",
      verantwortlichId: a.verantwortlich?.id ?? "",
      faelligAm: a.faelligAm ? a.faelligAm.slice(0, 10) : "",
    });
    setDialogOffen(true);
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!form.beschreibung.trim()) {
      toast.error("Beschreibung erforderlich");
      return;
    }
    const payload: Record<string, unknown> = {
      beschreibung: form.beschreibung.trim(),
      ursache: form.ursache.trim() || (editId ? null : undefined),
      massnahme: form.massnahme.trim() || (editId ? null : undefined),
      grundId: form.grundId || (editId ? null : undefined),
      verantwortlichId: form.verantwortlichId || (editId ? null : undefined),
      faelligAm: form.faelligAm ? new Date(form.faelligAm).toISOString() : editId ? null : undefined,
    };
    const res = editId
      ? await fetch(`/api/abweichungen/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/abweichungen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, typ: form.typ, auftragId }),
        });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Speichern fehlgeschlagen");
      return;
    }
    toast.success(editId ? "Abweichung aktualisiert" : "Abweichung gemeldet");
    setDialogOffen(false);
    mutate(key);
    mutate(`/api/auftraege/${auftragId}`); // reworkRequired-Spiegelung
  }

  async function setStatus(a: Abweichung, status: string) {
    const res = await fetch(`/api/abweichungen/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Statusänderung fehlgeschlagen");
      return;
    }
    mutate(key);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Abweichungen ({abweichungen.length})</h3>
        <Button size="sm" variant="outline" onClick={openNeu}>
          <Plus className="size-3 mr-1" /> Abweichung melden
        </Button>
      </div>

      {isLoading && <Skeleton className="h-12 w-full" />}
      {!isLoading && abweichungen.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Abweichungen erfasst.</p>
      )}

      <div className="space-y-2">
        {abweichungen.map((a) => {
          // Tagesvergleich: erst NACH dem Fälligkeitstag überfällig (Review)
          const ueberfaellig =
            a.status !== "abgeschlossen" &&
            a.faelligAm &&
            a.faelligAm.slice(0, 10) < new Date().toLocaleDateString("sv-SE");
          return (
            <div key={a.id} className="rounded-md border p-2.5 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {ABWEICHUNG_TYP_LABEL[a.typ] ?? a.typ}
                </Badge>
                {a.grund && <Badge variant="outline" className="text-[10px]">{a.grund.name}</Badge>}
                {ueberfaellig && <Badge variant="destructive" className="text-[10px]">überfällig</Badge>}
                <span className="flex-1" />
                <Select value={a.status} onValueChange={(v) => setStatus(a, v)}>
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(a)}>
                  <Pencil className="size-3.5" />
                </Button>
              </div>
              <p className="text-sm">{a.beschreibung}</p>
              <div className="grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                {a.ursache && <span>Ursache: {a.ursache}</span>}
                {a.massnahme && <span>Maßnahme: {a.massnahme}</span>}
                {a.verantwortlich && <span>Verantwortlich: {a.verantwortlich.name}</span>}
                {a.faelligAm && (
                  <span>Fällig: {new Date(a.faelligAm).toLocaleDateString("de-DE")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Abweichung bearbeiten" : "Abweichung melden"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={speichern} className="space-y-3">
            {!editId && (
              <div className="space-y-1.5">
                <Label>Typ</Label>
                <Select value={form.typ} onValueChange={(v) => setForm({ ...form, typ: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ABWEICHUNG_TYP_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Beschreibung *</Label>
              <Textarea
                required
                rows={2}
                value={form.beschreibung}
                onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
              />
            </div>
            {grundListe.length > 0 && (
              <div className="space-y-1.5">
                <Label>Grund (Katalog)</Label>
                <Select
                  value={form.grundId || "none"}
                  onValueChange={(v) => setForm({ ...form, grundId: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Kein Grund" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Grund</SelectItem>
                    {grundListe.map((g: { id: string; name: string }) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ursache</Label>
              <Textarea
                rows={2}
                value={form.ursache}
                onChange={(e) => setForm({ ...form, ursache: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Maßnahme</Label>
              <Textarea
                rows={2}
                value={form.massnahme}
                onChange={(e) => setForm({ ...form, massnahme: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Verantwortlich</Label>
                <Select
                  value={form.verantwortlichId || "none"}
                  onValueChange={(v) => setForm({ ...form, verantwortlichId: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="–" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">–</SelectItem>
                    {mitarbeiterListe.map((m: { id: string; name: string; kuerzel: string }) => (
                      <SelectItem key={m.id} value={m.id}>{m.kuerzel} – {m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fällig am</Label>
                <Input
                  type="date"
                  value={form.faelligAm}
                  onChange={(e) => setForm({ ...form, faelligAm: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOffen(false)}>
                Abbrechen
              </Button>
              <Button type="submit">Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
