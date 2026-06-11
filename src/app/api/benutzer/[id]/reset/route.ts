import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, ok, handlePrismaError } from "@/lib/api-helpers";
import { hashPassword, generateInitialPassword } from "@/lib/auth";
import { invalidateUserSessions } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

/** Setzt das Passwort auf ein neues Zufalls-Initialpasswort zurück; Nutzer muss es neu setzen. */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const initialPasswort = generateInitialPassword();
  try {
    await prisma.benutzer.update({
      where: { id },
      data: { passwortHash: await hashPassword(initialPasswort), mussPasswortAendern: true },
    });
    // Admin-Reset → alle Sessions des Ziel-Nutzers beenden (S-6).
    await invalidateUserSessions(id);
    return ok({ ok: true, initialPasswort });
  } catch (e) {
    return handlePrismaError(e);
  }
}
