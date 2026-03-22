import type { Market } from '../types.js'

/** Normalize token symbols for fuzzy matching (e.g. USD₮0 → USDT0) */
export function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/₮/g, 'T')
}

/** Standard metadata attached to all MCP prompt responses. */
export function meta() {
  return { chain: 'HyperEVM', chainId: 999, timestamp: new Date().toISOString() }
}

/** Shared risk assessment logic for lending markets. */
export function getRiskLevel(m: Market | { type: string; borrowAPY: number; utilization?: number }): 'low' | 'medium' | 'high' {
  if (m.type === 'mewler-earn') return 'low'
  
  // High borrow rates or high utilization indicate risk
  if ('borrowAPY' in m && m.borrowAPY > 15) return 'high'
  if ('utilization' in m && m.utilization !== undefined && m.utilization > 90) return 'high'
  
  if ('borrowAPY' in m && m.borrowAPY > 8) return 'medium'
  if ('utilization' in m && m.utilization !== undefined && m.utilization > 70) return 'medium'
  
  return 'low'
}
