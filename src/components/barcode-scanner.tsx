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

export function BarcodeScanner({ open, onClose, onResult }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<{
    decodeFromVideoDevice: (
      deviceId: string | undefined,
      videoElement: HTMLVideoElement,
      callback: (result: { getText(): string } | null, err: unknown) => void
    ) => Promise<void>;
    reset: () => void;
  } | null>(null);
  // Fallback-Zustand: wenn die Kamera nicht verfügbar/erlaubt ist, kann der
  // Code manuell eingegeben werden (vormals wurde der Fehler still verschluckt).
  const [kameraFehler, setKameraFehler] = useState<string | null>(null);
  const [manuell, setManuell] = useState("");

  useEffect(() => {
    if (!open) {
      readerRef.current?.reset();
      setKameraFehler(null);
      setManuell("");
      return;
    }

    let active = true;

    import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (!active || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader as unknown as typeof readerRef.current;

      reader
        .decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
          if (result) {
            onResult(result.getText());
          }
          void err;
        })
        .catch((e) => {
          if (!active) return;
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
      readerRef.current?.reset();
    };
  }, [open, onResult]);

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
              Kamera auf Barcode oder QR-Code richten
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
