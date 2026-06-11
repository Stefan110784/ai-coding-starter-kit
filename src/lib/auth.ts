import { randomBytes } from "crypto";
import argon2 from "argon2";
import { prisma } from "@/lib/prisma";
import type { Benutzer } from "@/generated/prisma";

/**
 * Erzeugt ein zufälliges Initialpasswort für neu angelegte / zurückgesetzte
 * Konten. Es wird dem Administrator einmalig angezeigt und muss beim ersten
 * Login geändert werden (mussPasswortAendern=true). Ersetzt das frühere feste
 * "kima2026", das als bekanntes Default-Passwort ein Sicherheitsrisiko war.
 */
export function generateInitialPassword(): string {
  // 9 Zufallsbytes → 12 Zeichen base64url. Da das Passwort sofort zu ändern
  // ist, sind eventuell mehrdeutige Zeichen unkritisch.
  return randomBytes(9).toString("base64url");
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<Benutzer | null> {
  const benutzer = await prisma.benutzer.findUnique({ where: { username } });
  if (!benutzer || !benutzer.aktiv) return null;

  const valid = await verifyPassword(benutzer.passwortHash, password);
  if (!valid) return null;

  return benutzer;
}

export function hasRight(benutzer: Benutzer, right: string): boolean {
  const rechte = benutzer.rechte as string[] | null;
  if (benutzer.rolle === "admin") return true;
  if (!rechte) return defaultRights(benutzer.rolle).includes(right);
  return rechte.includes(right);
}

function defaultRights(rolle: string): string[] {
  switch (rolle) {
    case "admin":
      return ["*"];
    case "kommissionierung":
      return ["auftraege_read", "kommissionierung", "material_read"];
    case "mitarbeiter":
      return [
        "auftraege_read",
        "zeiten",
        "qualitaet",
        "material_read",
        "inventur",
      ];
    default:
      return [];
  }
}
