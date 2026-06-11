import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { hashPassword, generateInitialPassword } from "@/lib/auth";
import { effektiveRechte } from "@/lib/rechte";
import type { Benutzer } from "@/generated/prisma";

const createSchema = z.object({
  username: z.string().min(1),
  name: z.string().optional(),
  rolle: z.enum(["admin", "kommissionierung", "mitarbeiter"]).default("mitarbeiter"),
  passwort: z.string().min(4).optional(),
  // Optional: direkt mit einem Mitarbeiter verknüpfen („Konto anlegen").
  mitarbeiterId: z.string().uuid().optional(),
});

export function benutzerDict(b: Benutzer) {
  return {
    id: b.id,
    username: b.username,
    name: b.name,
    rolle: b.rolle,
    aktiv: b.aktiv,
    mussPasswortAendern: b.mussPasswortAendern,
    rechte: [...effektiveRechte(b)].sort(),
    rechteExplizit: b.rechte != null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const benutzer = await prisma.benutzer.findMany({
    orderBy: { username: "asc" },
    include: { mitarbeiter: { select: { id: true, kuerzel: true, name: true } } },
  });
  return ok(
    benutzer.map((b) => ({ ...benutzerDict(b), mitarbeiter: b.mitarbeiter }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  const username = parsed.data.username.trim().toLowerCase();
  if (!username) return err("Benutzername leer");

  const existing = await prisma.benutzer.findUnique({ where: { username } });
  if (existing) return err("Benutzername bereits vergeben", 409);

  const hatPw = !!parsed.data.passwort;
  // Ohne explizites Passwort ein Zufalls-Initialpasswort erzeugen (einmalig
  // an den Admin zurückgeben), das beim ersten Login geändert werden muss.
  const initialPasswort = hatPw ? null : generateInitialPassword();

  try {
    const benutzer = await prisma.$transaction(async (tx) => {
      const b = await tx.benutzer.create({
        data: {
          username,
          name: parsed.data.name ?? null,
          rolle: parsed.data.rolle,
          passwortHash: await hashPassword(hatPw ? parsed.data.passwort! : initialPasswort!),
          mussPasswortAendern: !hatPw,
        },
      });
      if (parsed.data.mitarbeiterId) {
        await tx.mitarbeiter.update({
          where: { id: parsed.data.mitarbeiterId },
          data: { benutzerId: b.id },
        });
      }
      return b;
    });
    return ok(
      initialPasswort
        ? { ...benutzerDict(benutzer), initialPasswort }
        : benutzerDict(benutzer),
      201
    );
  } catch (e) {
    return handlePrismaError(e);
  }
}
