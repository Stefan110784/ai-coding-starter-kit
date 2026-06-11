import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";
import { nettobedarfFuerAuftrag, type NettobedarfResult } from "@/lib/stueckliste";
import { reservierungAktualisieren } from "@/lib/reservierung";

const createSchema = z.object({
  nummer: z.string().min(1),
  bezeichnung: z.string().min(1),
  menge: z.number().positive(),
  kunde: z.string().optional(),
  liefertermin: z.string().optional(),
  abNummer: z.string().optional(),
  notiz: z.string().optional(),
  prioritaet: z.number().int().min(0).max(2).optional(),
  // Vertriebs-Verknüpfung (KF3-37)
  kundenauftragId: z.string().uuid().optional(),
  positionen: z
    .array(
      z.object({
        posNr: z.number().int(),
        artikelnummer: z.string().optional(),
        bezeichnung: z.string(),
        menge: z.number().positive(),
        einheit: z.string().default("Stk"),
      })
    )
    .optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const search = searchParams.get("q");

  const auftraege = await prisma.auftrag.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { nummer: { contains: search, mode: "insensitive" } },
              { bezeichnung: { contains: search, mode: "insensitive" } },
              { abNummer: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      positionen: true,
      // Für die Statusampel: gibt es offene Abweichungen? (KF3-24/27)
      _count: { select: { abweichungen: { where: { status: { not: "abgeschlossen" } } } } },
    },
    orderBy: { erstelltAm: "desc" },
  });

  return ok(auftraege);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const { positionen, ...data } = parsed.data;

  // App-seitige Prüfung (kein DB-Unique: V2-Altdaten enthalten doppelte Nummern)
  const existing = await prisma.auftrag.findFirst({
    where: { nummer: data.nummer },
  });
  if (existing) return err("Auftragsnummer bereits vergeben", 409);

  // Kundenauftrag-Verknüpfung (KF3-37): validieren + Kundennamen nachziehen
  if (data.kundenauftragId) {
    const ka = await prisma.kundenauftrag.findUnique({
      where: { id: data.kundenauftragId },
      include: { kunde: { select: { name: true } } },
    });
    if (!ka || !ka.aktiv) return err("Kundenauftrag nicht gefunden", 404);
    if (!["neu", "freigegeben"].includes(ka.status)) {
      return err(`Kundenauftrag: Status ${ka.status} erlaubt keine Verknüpfung`);
    }
    if (!data.kunde) data.kunde = ka.kunde.name;
  }

  const anlegen = async () =>
    prisma.$transaction(async (tx) => {
      const angelegt = await tx.auftrag.create({
        data: {
          ...data,
          erstelltVonId: auth.benutzer.id,
          positionen: positionen
            ? { create: positionen }
            : undefined,
        },
        include: { positionen: true },
      });
      await auditEintrag(tx, {
        entitaet: "auftrag",
        entitaetId: angelegt.id,
        aktion: "erstellt",
        kontext: { nummer: angelegt.nummer, bezeichnung: angelegt.bezeichnung },
        benutzerId: auth.benutzer.id,
      });
      // Materialreservierung + Verfügbarkeitsprüfung (KF3-33): Netting gegen
      // effektiven Bestand, Anspruch in derselben Transaktion fixieren.
      let material: NettobedarfResult | null = null;
      if (angelegt.positionen.some((p) => p.artikelnummer)) {
        material = await nettobedarfFuerAuftrag(tx, angelegt.id);
        await reservierungAktualisieren(tx, angelegt.id, material, auth.benutzer.id);
      }
      return { ...angelegt, material };
    }, { isolationLevel: "Serializable" });

  // Serializable (KF3-33): zwei parallele Anlagen dürfen nicht beide den
  // vollen Bestand sehen und doppelt reservieren; bei P2034 einmal wiederholen.
  try {
    return ok(await anlegen(), 201);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2034") {
      try {
        return ok(await anlegen(), 201);
      } catch (e2) {
        return handlePrismaError(e2);
      }
    }
    return handlePrismaError(e);
  }
}
