import { NextRequest, NextResponse } from "next/server";
import { deleteSession, COOKIE_NAME } from "@/lib/session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) await deleteSession(token);

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
