/** Normalize token symbols for fuzzy matching (e.g. USD₮0 → USDT0) */
export function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/₮/g, 'T')
}

/** Standard metadata attached to all MCP prompt responses. */
export function meta() {
  return { chain: 'HyperEVM', chainId: 999, timestamp: new Date().toISOString() }
}
