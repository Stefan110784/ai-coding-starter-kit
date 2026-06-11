import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, ok } from "@/lib/api-helpers";

type Params = { params: Promise<{ auftragId: string }> };

/** Alle Abhak-Checks eines Auftrags zurücksetzen (V2: kommissionierung_checks_reset). */
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireRecht(req, "lager");
  if ("status" in auth) return auth;

  const { auftragId } = await params;
  await prisma.kommissionierCheck.deleteMany({ where: { auftragId } });
  return ok({ ok: true });
}
