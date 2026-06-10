import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth";
import { createSession, COOKIE_NAME } from "@/lib/session";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Brute-Force-Schutz: max. 10 Versuche je Benutzer+IP in 15 Minuten.
const LOGIN_LIMIT = 10;
const LOGIN_FENSTER_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rlKey = `login:${parsed.data.username.trim().toLowerCase()}:${ip}`;
  const rl = rateLimit(rlKey, LOGIN_LIMIT, LOGIN_FENSTER_MS);
  if (!rl.erlaubt) {
    return NextResponse.json(
      { error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(rl.retryNachSek) } }
    );
  }

  const benutzer = await authenticateUser(
    parsed.data.username,
    parsed.data.password
  );
  if (!benutzer) {
    return NextResponse.json(
      { error: "Benutzername oder Passwort falsch" },
      { status: 401 }
    );
  }

  // Erfolgreiche Anmeldung → Fehlversuchs-Zähler freigeben.
  rateLimitReset(rlKey);

  const token = await createSession(benutzer.id);
  const res = NextResponse.json({
    id: benutzer.id,
    username: benutzer.username,
    name: benutzer.name,
    rolle: benutzer.rolle,
    mussPasswortAendern: benutzer.mussPasswortAendern,
  });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60,
    path: "/",
  });
  return res;
}
