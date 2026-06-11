import { Badge } from "@/components/ui/badge";

/** Tagesliste-Priorität: 0 = Normal (kein Badge), 1 = Hoch, 2 = Dringend. */
export const PRIORITAET_LABELS: Record<number, string> = {
  0: "Normal",
  1: "Hoch",
  2: "Dringend",
};

export function PrioritaetBadge({ prioritaet }: { prioritaet?: number | null }) {
  if (!prioritaet) return null;
  return (
    <Badge
      variant={prioritaet >= 2 ? "destructive" : "secondary"}
      className={prioritaet === 1 ? "bg-amber-100 text-amber-900 hover:bg-amber-100" : undefined}
    >
      {PRIORITAET_LABELS[prioritaet] ?? prioritaet}
    </Badge>
  );
}
