import { statusampel, type AmpelInput } from "@/lib/statusampel";

const FARBE_CLASS: Record<string, string> = {
  rot: "bg-red-500",
  gelb: "bg-amber-400",
  gruen: "bg-green-500",
  grau: "bg-muted-foreground/40",
};

/** Farbiger Ampel-Punkt mit Grund als Tooltip (title). */
export function StatusampelPunkt({ auftrag }: { auftrag: AmpelInput }) {
  const { farbe, grund } = statusampel(auftrag);
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${FARBE_CLASS[farbe]}`}
      title={grund}
      aria-label={`Ampel: ${grund}`}
    />
  );
}
