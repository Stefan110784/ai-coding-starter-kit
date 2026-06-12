"use client";

import useSWR from "swr";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useMe } from "@/hooks/use-me";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function berlinMonat(versatz = 0): string {
  // Auf den 1. des Monats ankern — setMonth auf dem heutigen Datum läuft an
  // Monatsenden über (31.03. − 1 Monat → „Feb 31“ → März; Review-Befund)
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const [jahr, monat] = heute.split("-").map(Number);
  const d = new Date(Date.UTC(jahr, monat - 1 + versatz, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monats-Erinnerung (KF3-36): rein abgeleitet — aktive Bereiche ohne Audit im
 * laufenden Monat; fehlt auch der Vormonat → überfällig. Kein Cron, keine Mails.
 */
export function FuenfsErinnerung() {
  const { me, hatRecht } = useMe();
  const sichtbar = !!me && hatRecht("fuenfs");
  const { data: bereiche } = useSWR<Array<{ id: string; name: string }>>(
    sichtbar ? "/api/fuenfs/bereiche" : null,
    fetcher
  );
  const { data: audits } = useSWR<Array<{ bereich: { id: string }; monat: string }>>(
    sichtbar ? "/api/fuenfs/audits" : null,
    fetcher
  );

  if (!sichtbar || !Array.isArray(bereiche) || !Array.isArray(audits) || bereiche.length === 0) {
    return null;
  }

  const aktuell = berlinMonat();
  const vormonat = berlinMonat(-1);
  const offene = bereiche
    .map((b) => ({
      ...b,
      ueberfaellig: !audits.some((a) => a.bereich.id === b.id && (a.monat === aktuell || a.monat === vormonat)),
    }))
    .filter((b) => !audits.some((a) => a.bereich.id === b.id && a.monat === aktuell));

  if (offene.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
      <CardContent className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
        <Sparkles className="size-4 text-amber-600" />
        <span>5S-Audit ausstehend ({aktuell.slice(5)}/{aktuell.slice(0, 4)}):</span>
        {offene.map((b) => (
          <Link key={b.id} href="/fuenfs">
            <Badge variant={b.ueberfaellig ? "destructive" : "secondary"}>
              {b.name}
              {b.ueberfaellig && " · überfällig"}
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
