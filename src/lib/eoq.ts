/**
 * Economic Order Quantity (Wilson-/Andler-Formel)
 * EOQ = sqrt(2 * D * S / H)
 * D = Jahresbedarf (Stück/Jahr)
 * S = Bestellkosten (€ je Bestellung)
 * H = absolute Lagerhaltungskosten je Stück und Jahr (€/Stk/Jahr) — KEIN Prozentsatz.
 *     Nach Andler entspricht H = Einkaufspreis × Lagerzinssatz.
 */
export function calculateEOQ(D: number, S: number, H: number): number | null {
  if (D <= 0 || S <= 0 || H <= 0) return null;
  return Math.sqrt((2 * D * S) / H);
}

export function calculateReorderPoint(
  dailyDemand: number,
  leadTimeDays: number,
  safetyStock = 0
): number {
  return dailyDemand * leadTimeDays + safetyStock;
}

export function calculateAnnualCost(
  D: number,
  S: number,
  H: number,
  Q: number
): number {
  return (D / Q) * S + (Q / 2) * H;
}
