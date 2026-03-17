import { type Address, type PublicClient, erc20Abi } from 'viem'
import { DEFAULT_DECIMALS } from '../config/constants'

export interface TokenMeta {
  symbol: string
  decimals: number
}

/**
 * Batch-fetch ERC-20 decimals + symbol for a list of token addresses.
 * Returns a map keyed by lowercase address.
 */
export async function fetchTokenMetadata(client: PublicClient, addresses: Address[]): Promise<Map<string, TokenMeta>> {
  if (addresses.length === 0) return new Map()

  const [decResults, symResults] = await Promise.all([
    client.multicall({
      contracts: addresses.map((a) => ({ address: a, abi: erc20Abi, functionName: 'decimals' as const })),
      allowFailure: true,
    }),
    client.multicall({
      contracts: addresses.map((a) => ({ address: a, abi: erc20Abi, functionName: 'symbol' as const })),
      allowFailure: true,
    }),
  ])

  const result = new Map<string, TokenMeta>()
  for (let i = 0; i < addresses.length; i++) {
    const key = addresses[i]!.toLowerCase()
    result.set(key, {
      decimals: decResults[i]?.status === 'success' ? (decResults[i]!.result as number) : DEFAULT_DECIMALS,
      symbol: symResults[i]?.status === 'success' ? (symResults[i]!.result as string) : 'UNKNOWN',
    })
  }

  return result
}
