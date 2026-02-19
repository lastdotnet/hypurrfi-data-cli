/**
 * Structured JSON output for agent consumption.
 * All commands output to stdout as JSON for piping to other tools.
 */

export interface ApiResponse<T> {
  ok: boolean
  data: T
  meta: {
    chain: string
    chainId: number
    timestamp: string
    source: string
  }
}

export function success<T>(data: T): ApiResponse<T> {
  return {
    ok: true,
    data,
    meta: {
      chain: 'HyperEVM',
      chainId: 999,
      timestamp: new Date().toISOString(),
      source: '@hypurrfi/data-cli',
    },
  }
}

export function error(_message: string): ApiResponse<null> {
  return {
    ok: false,
    data: null,
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
