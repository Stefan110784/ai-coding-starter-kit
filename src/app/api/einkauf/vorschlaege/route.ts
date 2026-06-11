import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, ok } from "@/lib/api-helpers";
import { generiereBestellvorschlaege } from "@/lib/bestellvorschlag";

/** Bestellvorschläge aus Meldebestand + EOQ + offenen Bestellmengen (KF3-29). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "einkauf");
  if ("status" in auth) return auth;

  return ok(await generiereBestellvorschlaege(prisma));
}
