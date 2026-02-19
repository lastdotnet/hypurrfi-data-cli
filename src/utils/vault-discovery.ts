import type { Address, PublicClient } from 'viem'
import { perspectiveAbi } from '../config/abis.js'
import { PERSPECTIVES } from '../config/contracts.js'

/**
 * Discover all Mewler lending vaults (governed + edgeFactory, minus earn vaults).
 */
export async function discoverMewlerLendVaults(client: PublicClient): Promise<Address[]> {
  const perspCalls = [PERSPECTIVES.governed, PERSPECTIVES.edgeFactory].map((addr) => ({
    address: addr,
    abi: perspectiveAbi,
    functionName: 'verifiedArray' as const,
  }))
  const perspResults = await client.multicall({ contracts: perspCalls, allowFailure: true })

  const vaultSet = new Set<Address>()
  for (const res of perspResults) {
    if (res.status === 'success') {
      for (const addr of res.result as Address[]) vaultSet.add(addr)
    }
  }

  try {
    const earnRes = await client.readContract({
      address: PERSPECTIVES.mewlerEarnGoverned,
      abi: perspectiveAbi,
      functionName: 'verifiedArray',
    })
    for (const addr of earnRes as Address[]) vaultSet.delete(addr)
  } catch {
    /* earn perspective unavailable */
  }

  return [...vaultSet]
}

/**
 * Discover all Mewler Earn vault addresses.
 */
export async function discoverMewlerEarnVaults(client: PublicClient): Promise<Address[]> {
  try {
    const res = await client.readContract({
      address: PERSPECTIVES.mewlerEarnGoverned,
      abi: perspectiveAbi,
      functionName: 'verifiedArray',
    })
    return res as Address[]
  } catch {
    return []
  }
}
