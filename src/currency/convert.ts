/** Currency arithmetic. Pure: rates are passed in, so it is tested without a network. Rates are "how many of that money one US dollar buys". */
export type Rates = Record<string, number>;

/** The rate from one money to another (how many `to` one `from` buys), or null when either has no rate. A rate typed by the person wins. */
export function rateBetween(from: string, to: string, rates: Rates, own?: number | null): number | null {
  if (own && own > 0) return own;
  if (from === to) return 1;
  const a = rates[from]; const b = rates[to];
  return a > 0 && b > 0 ? b / a : null;
}

/** Two decimals for ordinary amounts, more when the amount is tiny so it does not read as zero; thousands separated. */
export function showMoney(n: number): string {
  const digits = Math.abs(n) >= 1 || n === 0 ? 2 : Math.abs(n) >= 0.01 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits === 2 ? 2 : 0, maximumFractionDigits: digits });
}

/** The days between a rate date ("2026-11-23") and now, or null when there is no date. */
export function ageInDays(date: string | null, now = Date.now()): number | null {
  if (!date) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null;
}
