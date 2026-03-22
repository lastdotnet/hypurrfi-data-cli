/** Normalize token symbols for fuzzy matching (e.g. USD₮0 → USDT0) */
export function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/₮/g, 'T')
}
