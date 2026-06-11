"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AuditEventRow {
  id: string;
  aktion: string;
  feld?: string | null;
  altWert?: string | null;
  neuWert?: string | null;
  zeitstempel: string;
  benutzer?: { username: string; name?: string | null } | null;
}

const AKTION_LABEL: Record<string, string> = {
  statuswechsel: "Statuswechsel",
  feldAenderung: "Änderung",
  erstellt: "Erstellt",
  geloescht: "Gelöscht",
  endpruefung: "Endprüfung",
  // KF3-33/37
  reserviert: "Material reserviert",
  reservierungAufgeloest: "Reservierung aufgelöst",
  kundenauftragVerknuepft: "Kundenauftrag verknüpft",
  kundenauftragGeloest: "Kundenauftrag gelöst",
  kundeKonflikt: "Kunden-Konflikt (Beleg)",
  wareneingang: "Wareneingang",
};

const FELD_LABEL: Record<string, string> = {
  status: "Status",
  notiz: "Notiz",
  bezeichnung: "Bezeichnung",
  menge: "Menge",
  kunde: "Kunde",
  liefertermin: "Liefertermin",
  abNummer: "AB-Nummer",
  pausengrund: "Pausengrund",
  reworkRequired: "Nacharbeit nötig",
  reworkReason: "Nacharbeitsgrund",
  stalledMissingParts: "Fehlteile",
  stallDays: "Stillstandstage",
  kpiAusgeschlossen: "KPI ausgeschlossen",
  promisedDate: "Zugesagter Termin",
  prioritaet: "Priorität",
};

function formatZeit(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function wert(v?: string | null) {
  if (v === null || v === undefined) return "–";
  // ISO-Zeitstempel lesbar machen
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString("de-DE");
  if (v === "true") return "ja";
  if (v === "false") return "nein";
  return v;
}

/** Read-only Audit-Verlauf eines Auftrags (KF3-25, ISO 7.5). */
export function AuftragVerlauf({ auftragId }: { auftragId: string }) {
  const { data, isLoading } = useSWR(
    `/api/audit?entitaet=auftrag&entitaetId=${auftragId}`,
    fetcher
  );
  const events: AuditEventRow[] = Array.isArray(data) ? data : [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Noch keine Verlaufseinträge (Historie beginnt mit der ersten Änderung).
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Zeit</TableHead>
          <TableHead>Benutzer</TableHead>
          <TableHead>Ereignis</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap text-xs">{formatZeit(e.zeitstempel)}</TableCell>
            <TableCell className="text-xs">
              {e.benutzer ? (e.benutzer.name || e.benutzer.username) : "–"}
            </TableCell>
            <TableCell className="text-xs">
              <Badge variant="outline" className="mr-2 text-[10px]">
                {AKTION_LABEL[e.aktion] ?? e.aktion}
              </Badge>
              {e.feld ? (
                <span>
                  {FELD_LABEL[e.feld] ?? e.feld}: <span className="text-muted-foreground">{wert(e.altWert)}</span>
                  {" → "}
                  <span className="font-medium">{wert(e.neuWert)}</span>
                </span>
              ) : (
                // Ereignisse ohne Feldbezug (Verknüpfungen, Konflikte): Werte zeigen
                (e.altWert || e.neuWert) && (
                  <span>
                    {e.altWert && <span className="text-muted-foreground">{wert(e.altWert)}</span>}
                    {e.altWert && e.neuWert && " → "}
                    {e.neuWert && <span className="font-medium">{wert(e.neuWert)}</span>}
                  </span>
                )
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
