import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { requireRecht } from "@/lib/api-helpers";
import { auftragReport, mitarbeiterReport, qualitaetReport } from "@/lib/auswertung";

function fmtDauer(sek: number | null): string {
  if (sek === null) return "—";
  const s = Math.trunc(sek);
  const h = Math.trunc(s / 3600);
  const m = Math.trunc((s % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** PDF-Gesamtbericht mit 3 Tabellen (V2: GET /api/auswertung/bericht.pdf, fpdf2). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "auswertung");
  if ("status" in auth) return auth;

  const [auftraege, mitarbeiter, qualitaet] = await Promise.all([
    auftragReport(),
    mitarbeiterReport(null, null),
    qualitaetReport(),
  ]);

  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("KIMA-Flow Auswertung", 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Erstellt: " +
      new Date().toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
    14,
    21
  );

  const tabellenStil = {
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [60, 60, 60] as [number, number, number] },
    margin: { left: 14, right: 14 },
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Nachkalkulation je Auftrag (Soll/Ist)", 14, 30);
  autoTable(doc, {
    ...tabellenStil,
    startY: 33,
    head: [["Nummer", "Bezeichnung", "Status", "Ist", "Soll", "Differenz"]],
    body: auftraege.map((r) => [
      r.nummer, r.bezeichnung, r.status,
      fmtDauer(r.ist_sekunden), fmtDauer(r.soll_sekunden), fmtDauer(r.diff_sekunden),
    ]),
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Zeiten je Mitarbeiter (gesamt)", 14, y);
  autoTable(doc, {
    ...tabellenStil,
    startY: y + 3,
    head: [["Mitarbeiter", "Gebuchte Zeit", "Buchungen"]],
    body: mitarbeiter.map((r) => [r.mitarbeiter, fmtDauer(r.sekunden), String(r.buchungen)]),
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Qualität je Auftrag", 14, y);
  autoTable(doc, {
    ...tabellenStil,
    startY: y + 3,
    head: [["Auftrag", "Gut", "Ausschuss", "Nacharbeit", "Ausschuss-%"]],
    body: qualitaet.map((r) => [
      r.auftrag, String(r.gut), String(r.ausschuss), String(r.nacharbeit), String(r.ausschussquote),
    ]),
  });

  const bytes = Buffer.from(doc.output("arraybuffer"));
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="kimaflow-bericht.pdf"',
      "Content-Length": String(bytes.length),
    },
  });
}
