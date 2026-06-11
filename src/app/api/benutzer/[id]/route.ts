import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, err, ok, handlePrismaError } from "@/lib/api-helpers";
import { ALLE_RECHTE } from "@/lib/rechte";
import { benutzerDict } from "../route";

const patchSchema = z.object({
  name: z.string().min(1).nullable().optional(),
  rolle: z.enum(["admin", "kommissionierung", "mitarbeiter"]).optional(),
  aktiv: z.boolean().optional(),
  // null/undefined = unverändert; Liste (auch leer) = Rechte explizit setzen.
  rechte: z.array(z.string()).nullable().optional(),
});

type Params = { params: Promise<{ id: string }> };

async function istLetzterAdmin(id: string): Promise<boolean> {
  const b = await prisma.benutzer.findUnique({ where: { id } });
  if (!b || b.rolle !== "admin") return false;
  const anzahl = await prisma.benutzer.count({ where: { rolle: "admin" } });
  return anzahl <= 1;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Ungültige Eingabe");

  // Letzten Admin nicht degradieren.
  if (parsed.data.rolle && parsed.data.rolle !== "admin" && (await istLetzterAdmin(id))) {
    return err("Der letzte Administrator kann nicht herabgestuft werden", 409);
  }

  // Unbekannte Rechte ablehnen.
  if (parsed.data.rechte != null) {
    const unbekannt = parsed.data.rechte.filter((k) => !ALLE_RECHTE.has(k));
    if (unbekannt.length) return err(`Unbekannte Rechte: ${unbekannt.join(", ")}`);
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.rolle !== undefined) data.rolle = parsed.data.rolle;
  if (parsed.data.aktiv !== undefined) data.aktiv = parsed.data.aktiv;
  if (parsed.data.rechte !== undefined) {
    data.rechte = parsed.data.rechte === null ? null : [...new Set(parsed.data.rechte)].sort();
  }

  try {
    const benutzer = await prisma.benutzer.update({ where: { id }, data });
    return ok(benutzerDict(benutzer));
  } catch (e) {
    return handlePrismaError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (await istLetzterAdmin(id)) {
    return err("Der letzte Administrator kann nicht gelöscht werden", 409);
  }
  try {
    await prisma.benutzer.delete({ where: { id } });
    return ok({ ok: true });
  } catch (e) {
    return handlePrismaError(e);
  }
}
