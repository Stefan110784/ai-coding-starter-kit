import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Dauer in Sekunden als „2h 15m" bzw. „45m" / „30s". */
export function formatDuration(sekunden: number): string {
  if (!Number.isFinite(sekunden) || sekunden < 0) return "–"
  const s = Math.floor(sekunden)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

/** Datum + Uhrzeit, deutsch, kompakt (z. B. „08.06.2026, 14:30"). */
export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "–"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "–"
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Nur Datum, deutsch (z. B. „08.06.2026"). */
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "–"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "–"
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}
