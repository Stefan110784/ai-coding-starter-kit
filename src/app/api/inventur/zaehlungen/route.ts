import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRecht, ok } from "@/lib/api-helpers";
import type { Inventurstatus } from "@/generated/prisma";

const STATUS_WERTE = new Set(["erfasst", "gebucht", "verworfen"]);

/** Zählungen-Liste, default nur offene (V2: GET /zaehlungen). */
export async function GET(req: NextRequest) {
  const auth = await requireRecht(req, "lager.buchen");
  if ("status" in auth) return auth;

  const status = req.nextUrl.searchParams.get("status") ?? "erfasst";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 200);

  const zaehlungen = await prisma.inventurZaehlung.findMany({
    where: STATUS_WERTE.has(status) ? { status: status as Inventurstatus } : {},
    include: {
      artikel: { select: { bezeichnung: true, einheit: true } },
      erfasstVon: { select: { username: true, name: true } },
      lagerort: { select: { name: true } },
    },
    orderBy: { erfasstAm: "desc" },
    take: limit,
  });

  return ok(
    zaehlungen.map((z) => ({
      ...z,
      differenz: (z.istMenge ?? 0) - z.sollMenge,
    }))
  );
}
