/**
 * Structured output for agent consumption.
 * Supports JSON (default) and CSV formats.
 */

export type OutputFormat = 'json' | 'csv'

export interface ApiResponse<T> {
  ok: boolean
  data: T
  warnings?: string[]
  meta: {
    chain: string
    chainId: number
    timestamp: string
    source: string
  }
}

export function success<T>(data: T, warnings?: string[]): ApiResponse<T> {
  const response: ApiResponse<T> = {
    ok: true,
    data,
    meta: {
      chain: 'HyperEVM',
      chainId: 999,
      timestamp: new Date().toISOString(),
      source: '@hypurrfi/data-cli',
    },
  }
  if (warnings && warnings.length > 0) response.warnings = warnings
  return response
}

export function error(message: string): ApiResponse<{ message: string }> {
  return {
    ok: false,
    data: { message },
    meta: {
      chain: 'HyperEVM',
      chainId: 999,
      timestamp: new Date().toISOString(),
      source: '@hypurrfi/data-cli',
    },
  }
}

export function print<T>(response: ApiResponse<T>): void {
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`)
}

// ── CSV output ────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]!)
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','))
  }
  return lines.join('\n')
}

export function printCSV(rows: Record<string, unknown>[]): void {
  process.stdout.write(`${toCSV(rows)}\n`)
}
