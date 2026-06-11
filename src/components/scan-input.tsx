"use client";

import { useState } from "react";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarcodeScanner } from "@/components/barcode-scanner";

interface ScanButtonProps {
  /** Wird mit dem gescannten (oder manuell eingegebenen) Code aufgerufen. */
  onScan: (code: string) => void;
  title?: string;
  className?: string;
  size?: "default" | "sm" | "icon";
}

/**
 * Wiederverwendbarer Scan-Knopf: kapselt den BarcodeScanner-Dialog, damit
 * jeder Erfassungs-Flow (Zeiten, Kommissionierung, Wareneingang …) mit einer
 * Zeile scannbar wird (KF3-22).
 */
export function ScanButton({ onScan, title = "Scannen", className, size = "icon" }: ScanButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        title={title}
        aria-label={title}
      >
        <QrCode className="size-4" />
        {size !== "icon" && <span className="ml-1">{title}</span>}
      </Button>
      <BarcodeScanner
        open={open}
        onClose={() => setOpen(false)}
        onResult={(code) => {
          setOpen(false);
          onScan(code.trim());
        }}
      />
    </>
  );
}
