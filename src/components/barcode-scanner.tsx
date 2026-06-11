"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onResult: (code: string) => void;
}

/** Nach so vielen ms ohne Videobild gilt die Kamera als stumm (iOS-Fall ohne Exception). */
const KAMERA_TIMEOUT_MS = 5000;

export function BarcodeScanner({ open, onClose, onResult }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // IScannerControls aus @zxing/browser ≥0.2 — stop() beendet Scan-Loop UND Kamera-Stream.
  // (Das frühere reader.reset() existiert in 0.2 nicht mehr; der Stream lief weiter.)
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  // Fallback-Zustand: wenn die Kamera nicht verfügbar/erlaubt ist oder kein Bild
  // liefert, bleibt die manuelle Eingabe der primäre Weg (Tablet-Fallback, U-2).
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [kameraAktiv, setKameraAktiv] = useState(false);
  const [manuell, setManuell] = useState("");
  // onResult über Ref entkoppeln: Inline-Callbacks der Eltern bekommen pro
  // Render eine neue Identität — als Effect-Dependency würde das die Kamera
  // bei jedem Parent-Re-Render neu starten und die Eingabe leeren (Review).
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    // Nach Timeout/Fehler darf der (evtl. später doch noch auflösende)
    // Scan-Loop nicht verdeckt weiterlaufen (Stream-Leak, Review-Befund).
    let abgebrochen = false;
    const video = videoRef.current;

    // iOS/iPad-Fall: getUserMedia "läuft", liefert aber nie ein Bild (kein Fehler).
    const timeout = setTimeout(() => {
      if (!active) return;
      abgebrochen = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setKameraFehler("Kamera liefert kein Bild. Bitte den Code manuell eingeben.");
    }, KAMERA_TIMEOUT_MS);
    const onPlaying = () => {
      if (!active || abgebrochen) return;
      clearTimeout(timeout);
      setKameraAktiv(true);
    };
    video?.addEventListener("playing", onPlaying);

    import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (!active || abgebrochen || !videoRef.current) return;

      new BrowserMultiFormatReader()
        .decodeFromConstraints(
          // Rückkamera bevorzugen (weiche Vorgabe): auf iPads wählte die
          // Default-Kamera sonst die Frontkamera bzw. blieb schwarz (U-2).
          { video: { facingMode: "environment" } },
          videoRef.current,
          (result, err, controls) => {
            if (!active || abgebrochen) {
              controls.stop();
              return;
            }
            if (result) {
              // Nach Treffer stoppen: kein Mehrfach-Feuern, Kamera sofort aus.
              controls.stop();
              controlsRef.current = null;
              navigator.vibrate?.(80);
              onResultRef.current(result.getText());
            }
            void err; // NotFoundException pro Frame ist Normalbetrieb
          }
        )
        .then((controls) => {
          if (!active || abgebrochen) {
            controls.stop();
            return;
          }
          controlsRef.current = controls;
        })
        .catch((e) => {
          if (!active) return;
          clearTimeout(timeout);
          abgebrochen = true;
          const name = (e as { name?: string })?.name;
          setKameraFehler(
            name === "NotAllowedError"
              ? "Kamerazugriff verweigert. Bitte den Code manuell eingeben."
              : "Kamera nicht verfügbar. Bitte den Code manuell eingeben."
          );
        });
    });

    return () => {
      active = false;
      clearTimeout(timeout);
      video?.removeEventListener("playing", onPlaying);
      controlsRef.current?.stop();
      controlsRef.current = null;
      setKameraFehler(null);
      setKameraAktiv(false);
      setManuell("");
    };
  }, [open]);

  function uebernehmen(e: React.FormEvent) {
    e.preventDefault();
    const code = manuell.trim();
    if (!code) return;
    onResult(code);
    setManuell("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Barcode / QR-Code scannen</DialogTitle>
        </DialogHeader>

        {kameraFehler ? (
          <div
            role="alert"
            className="rounded-lg bg-muted p-4 text-sm text-center text-muted-foreground"
          >
            {kameraFehler}
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg bg-black aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white/60 rounded-lg" />
              </div>
            </div>
            <p className="text-sm text-center text-muted-foreground">
              {kameraAktiv ? "Kamera auf Barcode oder QR-Code richten" : "Kamera startet…"}
            </p>
          </>
        )}

        {/* Manuelle Eingabe ist immer verfügbar (auch als Tablet-Fallback). */}
        <form onSubmit={uebernehmen} className="flex gap-2">
          <Input
            value={manuell}
            onChange={(e) => setManuell(e.target.value)}
            placeholder="Code manuell eingeben"
            aria-label="Code manuell eingeben"
            autoComplete="off"
          />
          <Button type="submit" size="sm" disabled={!manuell.trim()}>
            Übernehmen
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
