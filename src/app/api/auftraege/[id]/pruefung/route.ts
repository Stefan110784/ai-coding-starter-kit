import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRecht, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { auditEintrag } from "@/lib/audit";

/** Endprüfung am Auftrag (ISO 8.6, KF3-26). */

const createSchema = z
  .object({
    ergebnis: z.enum(["ok", "bedingtFrei", "abweichend"]),
    bemerkung: z.string().trim().optional(),
    menge: z.number().positive().optional(),
  })
  .refine((d) => d.ergebnis === "ok" || (d.bemerkung && d.bemerkung.length > 0), {
    message: "Bemerkung ist bei bedingter Freigabe / Abweichung Pflicht",
    path: ["bemerkung"],
  });

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const pruefungen = await prisma.pruefung.findMany({
    where: { auftragId: id, typ: "endpruefung" },
    include: { pruefer: { select: { username: true, name: true } } },
    orderBy: { geprueftAm: "desc" },
  });
  return ok(pruefungen);
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "qualitaet");
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Ungültige Eingabe");
  }

  try {
    const pruefung = await prisma.$transaction(async (tx) => {
      const auftrag = await tx.auftrag.findUnique({ where: { id } });
      if (!auftrag) throw new NotFound();

      const angelegt = await tx.pruefung.create({
        data: {
          typ: "endpruefung",
          ergebnis: parsed.data.ergebnis,
          bemerkung: parsed.data.bemerkung || null,
          menge: parsed.data.menge,
          auftragId: id,
          // Denormalisiert: Nachweis bleibt lesbar nach Auftrags-Löschung
          auftragNummer: auftrag.nummer,
          prueferId: auth.benutzer.id,
        },
        include: { pruefer: { select: { username: true, name: true } } },
      });

      await auditEintrag(tx, {
        entitaet: "auftrag",
        entitaetId: id,
        aktion: "endpruefung",
        feld: "ergebnis",
        neuWert: parsed.data.ergebnis,
        kontext: { nummer: auftrag.nummer, ...(parsed.data.bemerkung ? { bemerkung: parsed.data.bemerkung } : {}) },
        benutzerId: auth.benutzer.id,
      });

      return angelegt;
    });

    return ok(pruefung, 201);
  } catch (e) {
    if (e instanceof NotFound) return err("Auftrag nicht gefunden", 404);
    return handlePrismaError(e);
  }
}

class NotFound extends Error {}
