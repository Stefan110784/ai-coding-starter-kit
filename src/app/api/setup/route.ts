import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

const schema = z.object({
  username: z.string().min(3).max(50),
  name: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const count = await prisma.benutzer.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Setup bereits abgeschlossen" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const hash = await hashPassword(parsed.data.password);
  const benutzer = await prisma.benutzer.create({
    data: {
      username: parsed.data.username,
      name: parsed.data.name,
      rolle: "admin",
      passwortHash: hash,
    },
  });

  return NextResponse.json({ id: benutzer.id, username: benutzer.username });
}

export async function GET() {
  const count = await prisma.benutzer.count();
  return NextResponse.json({ setupRequired: count === 0 });
}
