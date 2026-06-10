import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { effektiveRechte } from "@/lib/rechte";

export async function GET() {
  const benutzer = await getSession();
  if (!benutzer) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  return NextResponse.json({
    id: benutzer.id,
    username: benutzer.username,
    name: benutzer.name,
    rolle: benutzer.rolle,
    rechte: [...effektiveRechte(benutzer)],
    mussPasswortAendern: benutzer.mussPasswortAendern,
  });
}
