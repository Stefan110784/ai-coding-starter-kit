"use client";

import { useState, useEffect, useRef } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
];

export default function PlanungPage() {
  const [viewMode, setViewMode] = useState<"woche" | "monat">("woche");
  const [refDate, setRefDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    auftragId: "",
    mitarbeiterId: "",
    geplantVon: "",
    geplantBis: "",
    notiz: "",
  });

  const weekStart = startOfWeek(refDate);
  const days = viewMode === "woche" ? 7 : 28;
  const vonStr = isoDate(weekStart) + "T00:00:00.000Z";
  const bisStr = isoDate(addDays(weekStart, days - 1)) + "T23:59:59.000Z";

  const { data: zuweisungen } = useSWR(
    `/api/planung?von=${vonStr}&bis=${bisStr}`,
    fetcher,
    { refreshInterval: 30000 }
  );
  const { data: mitarbeiter } = useSWR("/api/mitarbeiter", fetcher);
  const { data: auftraege } = useSWR("/api/auftraege", fetcher);

  const allMitarbeiter = Array.isArray(mitarbeiter) ? mitarbeiter : [];
  const allZuweisungen = Array.isArray(zuweisungen) ? zuweisungen : [];
  const dayHeaders = Array.from({ length: days }, (_, i) => addDays(weekStart, i));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      geplantVon: form.geplantVon ? new Date(form.geplantVon).toISOString() : "",
      geplantBis: form.geplantBis ? new Date(form.geplantBis).toISOString() : "",
    };
    const res = await fetch("/api/planung", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) { toast.error(body.error ?? "Fehler"); return; }
    toast.success("Zuweisung gespeichert");
    setShowCreate(false);
    mutate(`/api/planung?von=${vonStr}&bis=${bisStr}`);
  }

  async function deleteZuweisung(id: string) {
    await fetch(`/api/planung/${id}`, { method: "DELETE" });
    mutate(`/api/planung?von=${vonStr}&bis=${bisStr}`);
  }

  function navigate(dir: number) {
    setRefDate((d) => addDays(d, dir * days));
  }

  const today = isoDate(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Auftragsplanung</h1>
        <div className="flex gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={viewMode === "woche" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("woche")}
            >
              Woche
            </Button>
            <Button
              variant={viewMode === "monat" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("monat")}
            >
              4 Wochen
            </Button>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-2" />
            Zuweisung
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium min-w-[200px] text-center">
          {formatDate(weekStart)} – {formatDate(addDays(weekStart, days - 1))}
        </span>
        <Button variant="outline" size="icon" onClick={() => navigate(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRefDate(new Date())}>
          Heute
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto">
          <div className="min-w-[600px]">
            {/* Header Tage */}
            <div
              className="grid border-b"
              style={{ gridTemplateColumns: `160px repeat(${days}, 1fr)` }}
            >
              <div className="p-2 text-xs font-medium text-muted-foreground border-r">
                Mitarbeiter
              </div>
              {dayHeaders.map((d) => (
                <div
                  key={d.toISOString()}
                  className={`p-2 text-xs text-center border-r last:border-r-0 ${isoDate(d) === today ? "bg-primary/10 font-bold" : ""}`}
                >
                  <div className="font-medium">{d.toLocaleDateString("de-DE", { weekday: "short" })}</div>
                  <div className="text-muted-foreground">{formatDate(d)}</div>
                </div>
              ))}
            </div>

            {/* Zeilen pro Mitarbeiter */}
            {allMitarbeiter.map(
              (m: { id: string; name: string; kuerzel: string }, mi: number) => {
                const maZuweisungen = allZuweisungen.filter(
                  (z: { mitarbeiterId: string }) => z.mitarbeiterId === m.id
                );
                return (
                  <div
                    key={m.id}
                    className="grid border-b last:border-b-0"
                    style={{ gridTemplateColumns: `160px repeat(${days}, 1fr)` }}
                  >
                    <div className="p-2 border-r flex items-center gap-1.5 bg-muted/30">
                      <span className="text-xs font-bold bg-primary text-primary-foreground rounded px-1">
                        {m.kuerzel}
                      </span>
                      <span className="text-xs truncate">{m.name}</span>
                    </div>
                    {dayHeaders.map((d) => {
                      const dayStr = isoDate(d);
                      const tagesZuweisungen = maZuweisungen.filter((z: {
                        geplantVon: string;
                        geplantBis: string;
                      }) => {
                        const von = isoDate(new Date(z.geplantVon));
                        const bis = isoDate(new Date(z.geplantBis));
                        return von <= dayStr && bis >= dayStr;
                      });
                      return (
                        <div
                          key={dayStr}
                          className={`border-r last:border-r-0 p-0.5 min-h-[48px] ${dayStr === today ? "bg-primary/5" : ""}`}
                        >
                          {tagesZuweisungen.map(
                            (z: {
                              id: string;
                              auftrag: { nummer: string; bezeichnung: string };
                            }, zi: number) => (
                              <div
                                key={z.id}
                                className={`text-xs text-white rounded px-1 py-0.5 mb-0.5 truncate cursor-pointer hover:opacity-80 ${COLORS[(mi + zi) % COLORS.length]}`}
                                title={`${z.auftrag.nummer} – ${z.auftrag.bezeichnung}`}
                                onClick={() => deleteZuweisung(z.id)}
                              >
                                {z.auftrag.nummer}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }
            )}
            {allMitarbeiter.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Keine Mitarbeiter angelegt
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Klick auf einen Balken entfernt die Zuweisung.</p>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auftrag zuweisen</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Mitarbeiter *</Label>
              <Select value={form.mitarbeiterId} onValueChange={(v) => setForm({ ...form, mitarbeiterId: v })}>
                <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>
                  {allMitarbeiter.map((m: { id: string; kuerzel: string; name: string }) => (
                    <SelectItem key={m.id} value={m.id}>{m.kuerzel} – {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Auftrag *</Label>
              <Select value={form.auftragId} onValueChange={(v) => setForm({ ...form, auftragId: v })}>
                <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(auftraege) ? auftraege : []).map((a: { id: string; nummer: string; bezeichnung: string }) => (
                    <SelectItem key={a.id} value={a.id}>{a.nummer} – {a.bezeichnung}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Von *</Label>
                <Input type="datetime-local" required value={form.geplantVon} onChange={(e) => setForm({ ...form, geplantVon: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Bis *</Label>
                <Input type="datetime-local" required value={form.geplantBis} onChange={(e) => setForm({ ...form, geplantBis: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
              <Button type="submit">Speichern</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
