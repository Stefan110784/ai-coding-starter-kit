# KF3-22: Scanner-Durchgängigkeit

> **Status:** In Progress · **Erstellt:** 2026-06-11 · **Quelle:** Anforderungs-Gesamtübersicht Kap. 2 („Barcode-/QR-Scanning für alle Buchungen") + Audit-Befund U-2 (2026-06-10)

## Ziel

Scanning senkt Fehlbuchungen an der Quelle. Vorher war der Scanner nur in 2 von 5 Erfassungs-Flows eingebaut (Aufträge-Suche, Artikelanlage) und endete auf iPads in einer Sackgasse.

## Teil 1 — Scanner-Kern fixen (`src/components/barcode-scanner.tsx`)

- **Rückkamera-Constraint** `facingMode: "environment"` statt Default-Kamera (`decodeFromVideoDevice(undefined, …)`) — auf iPads wurde sonst die Frontkamera gewählt bzw. das Bild blieb schwarz.
- **Korrekte Stream-Beendigung:** Umstellung auf `decodeFromConstraints` + `IScannerControls.stop()`. Das vorherige `reader.reset()` existiert in `@zxing/browser` 0.2.0 nicht — der Aufruf warf zur Laufzeit und die Kamera lief nach dem Schließen weiter.
- **Stop nach Treffer + Feedback:** Scan-Loop stoppt beim ersten Ergebnis (kein Mehrfach-Feuern), `navigator.vibrate(80)` als Bestätigung.
- **Schwarzbild-Timeout:** Liefert das Video nach 5 s kein Bild (iOS-Fall ohne Exception), erscheint der Fallback-Hinweis; die manuelle Eingabe bleibt immer sichtbar.

## Teil 2 — Scan in weitere Flows (`src/components/scan-input.tsx`)

Wiederverwendbarer `ScanButton` (kapselt den Dialog), eingebaut in:

- **Zeiterfassung** (`zeiten/page.tsx`): Auftrag scannen → Auswahl im „Für andere buchen"-Formular (nur laufende Aufträge, sonst klare Fehlermeldung).
- **Kommissionier-Checkliste** (`kommissionierung-tab.tsx`): Artikel scannen → Position wird abgehakt (mit „bereits abgehakt"/„nicht auf der Liste"-Hinweisen).
- **Wareneingang:** folgt mit KF3-30 (Bestellwesen).

## Akzeptanzkriterien

- [x] iPad: Rückkamera wird bevorzugt; ohne Kamerabild erscheint nach 5 s der Hinweis, manuelle Eingabe jederzeit möglich
- [x] Nach erfolgreichem Scan stoppt die Kamera sofort (auch beim Schließen des Dialogs)
- [x] Auftrag per Scan stempelbar, Kommissionier-Position per Scan abhakbar
