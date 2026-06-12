import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok } from "@/lib/api-helpers";
import { lokalDatum } from "@/lib/auswertung";

/** Score-Trend je Bereich (abgeschlossene Audits, eingefrorene Scores). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "fuenfs");
  if ("status" in auth) return auth;

  const monate = parseInt(req.nextUrl.searchParams.get("monate") ?? "12", 10);
  if (!Number.isFinite(monate) || monate < 2 || monate > 24) {
    return err("monate zwischen 2 und 24", 422);
  }

  const heute = lokalDatum(new Date()).slice(0, 7);
  const [jahr, monat] = heute.split("-").map(Number);
  const liste: string[] = [];
  for (let i = monate - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(jahr, monat - 1 - i, 1));
    liste.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const audits = await prisma.fuenfSAudit.findMany({
    where: { status: "abgeschlossen", monat: { gte: liste[0] } },
    select: { monat: true, scoreProzent: true, bereich: { select: { id: true, name: true } } },
  });

  const bereiche = [...new Map(audits.map((a) => [a.bereich.id, a.bereich.name])).entries()].map(
    ([id, name]) => ({ id, name })
  );
  const punkte = liste.map((m) => {
    const zeile: Record<string, unknown> = { monat: m, label: `${m.slice(5)}/${m.slice(0, 4)}` };
    for (const a of audits.filter((x) => x.monat === m)) {
      zeile[a.bereich.name] = a.scoreProzent;
    }
    return zeile;
  });

  return ok({ bereiche, punkte });
}
