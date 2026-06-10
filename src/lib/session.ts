import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Benutzer } from "@/generated/prisma";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 Stunden
const COOKIE_NAME = "kima_session";

export async function createSession(benutzerId: string): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await prisma.session.create({
    data: {
      token,
      benutzerId,
      laeuftAb: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export async function getSession(): Promise<Benutzer | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findFirst({
    where: {
      token,
      laeuftAb: { gt: new Date() },
    },
    include: { benutzer: true },
  });

  if (!session) return null;
  // Deaktivierte Konten: bestehende Session sofort ungültig (S-5).
  if (!session.benutzer.aktiv) return null;
  return session.benutzer;
}

/**
 * Sessions eines Benutzers entwerten — z. B. nach Passwortwechsel/-reset (S-6).
 * Mit `exceptToken` bleibt die aktuelle Session bestehen (Self-Service-Wechsel);
 * ohne wird der Nutzer überall abgemeldet (Admin-Reset). Gibt die Anzahl
 * gelöschter Sessions zurück.
 */
export async function invalidateUserSessions(
  benutzerId: string,
  opts: { exceptToken?: string } = {}
): Promise<number> {
  const res = await prisma.session.deleteMany({
    where: opts.exceptToken
      ? { benutzerId, NOT: { token: opts.exceptToken } }
      : { benutzerId },
  });
  return res.count;
}

export async function deleteSession(token: string) {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

export async function cleanExpiredSessions() {
  await prisma.session.deleteMany({ where: { laeuftAb: { lt: new Date() } } });
}

export { COOKIE_NAME };
