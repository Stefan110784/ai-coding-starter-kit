"use client";

import useSWR from "swr";

export interface Me {
  id: string;
  username: string;
  name: string | null;
  rolle: "admin" | "kommissionierung" | "mitarbeiter";
  rechte: string[];
  mussPasswortAendern: boolean;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : null));

/**
 * Liefert den angemeldeten Benutzer (mit effektiven Rechten) und einen
 * `hatRecht`-Helfer zum Ein-/Ausblenden von UI gemäß Rechtesystem.
 */
export function useMe() {
  const { data: me, isLoading } = useSWR<Me | null>("/api/auth/me", fetcher);
  const hatRecht = (key: string) => !!me?.rechte?.includes(key);
  return { me, isLoading, hatRecht };
}
