/**
 * Einfaches In-Memory-Rate-Limit (Fixed Window) für einen Single-Instance-
 * Standalone-Server (so wird KIMA-Flow betrieben). Schützt v. a. den Login
 * gegen Brute-Force. Bei mehreren Instanzen/Replicas wäre ein geteilter Store
 * (z. B. Redis) nötig — dann greift dieses Limit nur pro Prozess.
 */

interface Eintrag {
  count: number;
  resetAt: number;
}

const store = new Map<string, Eintrag>();

export interface RateLimitResult {
  /** true = Anfrage erlaubt, false = Limit überschritten. */
  erlaubt: boolean;
  /** Sekunden bis zum Zurücksetzen des Fensters (nur relevant wenn !erlaubt). */
  retryNachSek: number;
}

/**
 * Zählt einen Versuch für `key` und meldet, ob das Limit innerhalb des
 * Zeitfensters überschritten ist.
 *
 * @param key      Eindeutiger Schlüssel, z. B. `login:<user>:<ip>`
 * @param limit    Maximale Versuche pro Fenster
 * @param fensterMs Länge des Zeitfensters in Millisekunden
 */
export function rateLimit(key: string, limit: number, fensterMs: number): RateLimitResult {
  const now = Date.now();

  // Notbremse gegen unbegrenztes Wachstum: abgelaufene Einträge aufräumen.
  if (store.size > 5000) {
    for (const [k, e] of store) if (e.resetAt <= now) store.delete(k);
  }

  const e = store.get(key);
  if (!e || e.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + fensterMs });
    return { erlaubt: true, retryNachSek: 0 };
  }

  e.count += 1;
  if (e.count > limit) {
    return { erlaubt: false, retryNachSek: Math.ceil((e.resetAt - now) / 1000) };
  }
  return { erlaubt: true, retryNachSek: 0 };
}

/** Zähler für einen Schlüssel zurücksetzen (z. B. nach erfolgreichem Login). */
export function rateLimitReset(key: string): void {
  store.delete(key);
}
