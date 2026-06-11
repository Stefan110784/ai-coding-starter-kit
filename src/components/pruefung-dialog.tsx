"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Ergebnis = "ok" | "bedingtFrei" | "abweichend";

interface PruefungDialogProps {
  auftrag: { id: string; nummer: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wird nach erfolgreich gespeicherter Freigabe (ok/bedingtFrei) aufgerufen — z. B. um den Abschluss erneut auszulösen. */
  onFreigabe: () => void;
}

/**
 * Endprüfung vor Auftragsabschluss (ISO 8.6, KF3-26). Öffnet sich automatisch,
 * wenn der Abschluss am Prüf-Gate (409 pruefungFehlt) scheitert — ein Fluss,
 * tablettauglich: Ergebnis antippen, ggf. Bemerkung, fertig.
 */
export function PruefungDialog({ auftrag, open, onOpenChange, onFreigabe }: PruefungDialogProps) {
  const [bemerkung, setBemerkung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  async function speichern(ergebnis: Ergebnis) {
    if (!auftrag) return;
    if (ergebnis !== "ok" && !bemerkung.trim()) {
      toast.error("Bei bedingter Freigabe / Abweichung ist eine Bemerkung Pflicht");
      return;
    }
    setLaeuft(true);
    try {
      const res = await fetch(`/api/auftraege/${auftrag.id}/pruefung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ergebnis, bemerkung: bemerkung.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Prüfung konnte nicht gespeichert werden");
        return;
      }
      setBemerkung("");
      onOpenChange(false);
      if (ergebnis === "abweichend") {
        toast.warning(`Prüfung dokumentiert — ${auftrag.nummer} bleibt offen (nicht bestanden)`);
      } else {
        toast.success(`Endprüfung ${auftrag.nummer}: ${ergebnis === "ok" ? "bestanden" : "bedingt freigegeben"}`);
        onFreigabe();
      }
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setBemerkung(""); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Endprüfung {auftrag?.nummer}</DialogTitle>
          <DialogDescription>
            Vor dem Abschluss ist eine dokumentierte Endprüfung erforderlich (ISO 8.6).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Bemerkung {`(Pflicht bei "bedingt" / "nicht bestanden")`}</Label>
          <Textarea
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            rows={3}
            placeholder="Prüfbefund, Abweichungen, Auflagen…"
          />
        </div>

        <div className="grid gap-2">
          <Button className="h-11 justify-start" disabled={laeuft} onClick={() => speichern("ok")}>
            <CheckCircle2 className="size-4 mr-2" /> Bestanden — freigeben
          </Button>
          <Button
            variant="outline"
            className="h-11 justify-start"
            disabled={laeuft}
            onClick={() => speichern("bedingtFrei")}
          >
            <AlertTriangle className="size-4 mr-2 text-amber-500" /> Bedingt freigeben
          </Button>
          <Button
            variant="outline"
            className="h-11 justify-start text-destructive hover:bg-destructive/10"
            disabled={laeuft}
            onClick={() => speichern("abweichend")}
          >
            <XCircle className="size-4 mr-2" /> Nicht bestanden — bleibt offen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
