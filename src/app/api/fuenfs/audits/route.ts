import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";
import { lokalDatum } from "@/lib/auswertung";

/** 5S-Audits (KF3-36): genau eines je Bereich+Monat. */

const createSchema = z.object({
  bereichId: z.string().uuid(),
  monat: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "fuenfs");
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const bereichId = searchParams.get("bereichId");
  const status = searchParams.get("status");
  if (status && !["entwurf", "abgeschlossen"].includes(status)) {
    return err("Ungültiger status-Filter");
  }

  const audits = await prisma.fuenfSAudit.findMany({
    where: {
      ...(bereichId ? { bereichId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      bereich: { select: { id: true, name: true } },
      erstelltVon: { select: { username: true, name: true } },
      _count: { select: { positionen: true } },
    },
    orderBy: [{ monat: "desc" }, { erstelltAm: "desc" }],
    take: 200,
  });
  return ok(audits);
}

export async function POST(req: NextRequest) {
  const auth = await requireRecht(req, "fuenfs.audit");
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");

  const heuteMonat = lokalDatum(new Date()).slice(0, 7);
  const monat = parsed.data.monat ?? heuteMonat;
  // Nur aktueller Monat oder Vormonat (Nachholen) — keine Zukunfts-Audits
  if (monat > heuteMonat) return err("Audits können nicht für künftige Monate angelegt werden");
  const [hJ, hM] = heuteMonat.split("-").map(Number);
  const vm = new Date(Date.UTC(hJ, hM - 2, 1));
  const vormonat = `${vm.getUTCFullYear()}-${String(vm.getUTCMonth() + 1).padStart(2, "0")}`;
  if (monat < vormonat) {
    return err("Audits können höchstens für den Vormonat nachgeholt werden");
  }

  try {
    const audit = await prisma.$transaction(async (tx) => {
      const bereich = await tx.fuenfSBereich.findUnique({ where: { id: parsed.data.bereichId } });
      if (!bereich || !bereich.aktiv) throw new BereichFehlt();

      const vorlage = await tx.fuenfSChecklistenPunkt.findMany({
        where: { aktiv: true },
        orderBy: { sortorder: "asc" },
      });
      if (vorlage.length === 0) throw new VorlageLeer();

      const angelegt = await tx.fuenfSAudit.create({
        data: {
          bereichId: bereich.id,
          monat,
          erstelltVonId: auth.benutzer.id,
          // Vorlage als Positionen EINFRIEREN — der Nachweis überlebt
          // spätere Änderungen an der Checkliste
          positionen: {
            create: vorlage.map((p) => ({
              kategorie: p.kategorie,
              text: p.text,
              sortorder: p.sortorder,
            })),
          },
        },
        include: { bereich: { select: { name: true } } },
      });
      await auditEintrag(tx, {
        entitaet: "fuenfsAudit",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: { bereich: angelegt.bereich.name, monat, punkte: vorlage.length },
        benutzerId: auth.benutzer.id,
      });
      return angelegt;
    });
    return ok(audit, 201);
  } catch (e) {
    if (e instanceof BereichFehlt) return err("Bereich nicht gefunden oder deaktiviert", 404);
    if (e instanceof VorlageLeer) return err("Checklisten-Vorlage ist leer — erst Punkte pflegen");
    if ((e as { code?: string })?.code === "P2002") {
      return err(`Für ${monat} existiert bereits ein Audit in diesem Bereich`, 409);
    }
    return handlePrismaError(e);
  }
}

class BereichFehlt extends Error {}
class VorlageLeer extends Error {}
