import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, invalidateUserSessions, COOKIE_NAME } from "@/lib/session";
import { err, ok, handlePrismaError } from "@/lib/api-helpers";
import { verifyPassword, hashPassword } from "@/lib/auth";

const schema = z.object({
  altesPasswort: z.string().min(1),
  neuesPasswort: z.string().min(4),
});

/** Eigenes Passwort ändern (für jeden angemeldeten Benutzer). */
export async function POST(req: NextRequest) {
  const benutzer = await getSession();
  if (!benutzer) return err("Nicht angemeldet", 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Neues Passwort muss mindestens 4 Zeichen haben");

  const valid = await verifyPassword(benutzer.passwortHash, parsed.data.altesPasswort);
  if (!valid) return err("Aktuelles Passwort ist falsch", 403);

  try {
    await prisma.benutzer.update({
      where: { id: benutzer.id },
      data: {
        passwortHash: await hashPassword(parsed.data.neuesPasswort),
        mussPasswortAendern: false,
      },
    });
    // Andere Sessions dieses Nutzers beenden, die aktuelle behalten (S-6).
    const aktuellerToken = (await cookies()).get(COOKIE_NAME)?.value;
    await invalidateUserSessions(benutzer.id, { exceptToken: aktuellerToken });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
