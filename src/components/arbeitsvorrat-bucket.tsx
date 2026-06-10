"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { LogIn, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface VorratAuftrag {
  id: string;
  nummer: string;
  bezeichnung: string;
  menge: number;
  status: string;
  liefertermin?: string | null;
  eingebucht: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  kommissioniert: "Kommissioniert",
  laeuft: "In Bearbeitung",
  pausiert: "Pausiert",
};

/**
 * „Mein Arbeitsvorrat": zugewiesene P/L-Aufträge + alle S-Aufträge, mit
 * Ein-/Ausstempeln auf den eigenen Mitarbeiter (V2: zeiten.js Bucket-Ansicht).
 */
export function ArbeitsvorratBucket() {
  const [modus, setModus] = useState<"bucket" | "alle">("bucket");
  const key = modus === "bucket" ? "/api/arbeitsvorrat" : "/api/arbeitsvorrat/alle";
  const { data, isLoading } = useSWR(key, fetcher, { refreshInterval: 15000 });

  async function stempeln(auftrag: VorratAuftrag) {
    const action = auftrag.eingebucht ? "abmelden" : "anmelden";
    const res = await fetch("/api/zeiten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, auftragId: auftrag.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Fehler beim Stempeln");
      return;
    }
    toast.success(
      auftrag.eingebucht ? `Ausgestempelt: ${auftrag.nummer}` : `Eingestempelt: ${auftrag.nummer}`
    );
    mutate("/api/arbeitsvorrat");
    mutate("/api/arbeitsvorrat/alle");
    mutate("/api/zeiten?offen=true");
    mutate("/api/zeiten?offen=false");
  }

  const auftraege: VorratAuftrag[] = data?.auftraege ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Mein Arbeitsvorrat</CardTitle>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={modus === "bucket" ? "default" : "outline"}
            onClick={() => setModus("bucket")}
          >
            Mein Vorrat
          </Button>
          <Button
            size="sm"
            variant={modus === "alle" ? "default" : "outline"}
            onClick={() => setModus("alle")}
          >
            Alle Aufträge
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        {!isLoading && auftraege.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            {modus === "bucket"
              ? "Dir sind aktuell keine Aufträge zugewiesen. „Alle Aufträge“ zeigt den kompletten aktiven Bestand."
              : "Keine aktiven Aufträge."}
          </p>
        )}
        {auftraege.map((a) => {
          const stempelbar = a.status === "kommissioniert" || a.status === "laeuft";
          return (
            <div
              key={a.id}
              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${a.eingebucht ? "border-primary bg-primary/5" : ""}`}
            >
              <div className="min-w-0">
                <span className="font-mono font-medium">{a.nummer}</span>
                <span className="ml-2 truncate text-sm text-muted-foreground">{a.bezeichnung}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <Badge variant={a.status === "laeuft" ? "default" : "secondary"} className="text-[10px]">
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                  <span>{a.menge} Stk</span>
                  {a.liefertermin && <span>· {a.liefertermin}</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant={a.eingebucht ? "outline" : "default"}
                disabled={!a.eingebucht && !stempelbar}
                title={
                  !a.eingebucht && !stempelbar
                    ? a.status === "offen"
                      ? "Auftrag ist noch nicht kommissioniert"
                      : "Auftrag ist pausiert"
                    : undefined
                }
                onClick={() => stempeln(a)}
              >
                {a.eingebucht ? (
                  <>
                    <LogOut className="size-3 mr-1" /> Ausstempeln
                  </>
                ) : (
                  <>
                    <LogIn className="size-3 mr-1" /> Einstempeln
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
