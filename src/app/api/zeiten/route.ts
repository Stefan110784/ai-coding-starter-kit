import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok } from "@/lib/api-helpers";
import { mitarbeiterFuerBenutzer } from "@/lib/benutzer";

// mitarbeiterId optional: ohne Angabe wird auf den eigenen Mitarbeiter gebucht
// (V2: _ziel_mitarbeiter via mitarbeiter_fuer_benutzer).
const anmeldenSchema = z.object({
  mitarbeiterId: z.string().uuid().optional(),
  auftragId: z.string().uuid(),
  kategorieId: z.string().uuid().optional(),
});

const abmeldenSchema = z.object({
  mitarbeiterId: z.string().uuid().optional(),
  auftragId: z.string().uuid(),
});

const nachtragSchema = z.object({
  mitarbeiterId: z.string().uuid(),
  auftragId: z.string().uuid(),
  start: z.string().datetime(),
  ende: z.string().datetime(),
  kategorieId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const mitarbeiterId = searchParams.get("mitarbeiterId");
  const auftragId = searchParams.get("auftragId");
  const offen = searchParams.get("offen") === "true";

  const zeiten = await prisma.auftragszeit.findMany({
    where: {
      ...(mitarbeiterId ? { mitarbeiterId } : {}),
      ...(auftragId ? { auftragId } : {}),
      ...(offen ? { ende: null } : {}),
    },
    include: { mitarbeiter: true, auftrag: true, kategorie: true },
    orderBy: { start: "desc" },
  });

  return ok(zeiten);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const action = body?.action as string;

  if (action === "anmelden") {
    const parsed = anmeldenSchema.safeParse(body);
    if (!parsed.success) return err("Ungültige Eingabe");
    const mitarbeiterId =
      parsed.data.mitarbeiterId ?? (await mitarbeiterFuerBenutzer(auth.benutzer)).id;

    const auftrag = await prisma.auftrag.findUnique({ where: { id: parsed.data.auftragId } });
    if (!auftrag) return err("Auftrag nicht gefunden", 404);
    if (auftrag.status === "offen") return err("Auftrag ist noch nicht kommissioniert.", 409);
    if (auftrag.status === "pausiert") {
      return err("Auftrag ist pausiert. Einstempeln derzeit nicht möglich.", 409);
    }

    // V2-Parität: paralleles Arbeiten an mehreren Aufträgen ist erlaubt
    // (anteilige Aufteilung) — nur Doppel-Einstempeln auf DENSELBEN Auftrag nicht.
    const offene = await prisma.auftragszeit.findFirst({
      where: { mitarbeiterId, auftragId: parsed.data.auftragId, ende: null },
    });
    if (offene) return err("Bereits auf diesen Auftrag eingestempelt", 409);

    const zeit = await prisma.auftragszeit.create({
      data: {
        mitarbeiterId,
        auftragId: parsed.data.auftragId,
        kategorieId: parsed.data.kategorieId,
        start: new Date(),
        beendetDurch: null,
      },
    });
    return ok(zeit, 201);
  }

  if (action === "abmelden") {
    const parsed = abmeldenSchema.safeParse(body);
    if (!parsed.success) return err("Ungültige Eingabe");
    const mitarbeiterId =
      parsed.data.mitarbeiterId ?? (await mitarbeiterFuerBenutzer(auth.benutzer)).id;

    const offene = await prisma.auftragszeit.findFirst({
      where: {
        mitarbeiterId,
        auftragId: parsed.data.auftragId,
        ende: null,
      },
    });
    if (!offene) return err("Keine offene Zeitbuchung gefunden", 404);

    const zeit = await prisma.auftragszeit.update({
      where: { id: offene.id },
      data: { ende: new Date(), beendetDurch: "normal" },
    });
    return ok(zeit);
  }

  if (action === "nachtrag") {
    const parsed = nachtragSchema.safeParse(body);
    if (!parsed.success) return err("Ungültige Eingabe");

    const start = new Date(parsed.data.start);
    const ende = new Date(parsed.data.ende);
    if (ende <= start) return err("Ende muss nach Start liegen");

    const zeit = await prisma.auftragszeit.create({
      data: {
        mitarbeiterId: parsed.data.mitarbeiterId,
        auftragId: parsed.data.auftragId,
        kategorieId: parsed.data.kategorieId,
        start,
        ende,
        beendetDurch: "nachtrag",
        istNachtrag: true,
      },
    });
    return ok(zeit, 201);
  }

  return err("Unbekannte Aktion");
}
