import type { PublicClient } from 'viem'
import { fetchMarketsData } from '../../commands/markets.js'
import { meta } from '../utils.js'

export async function compareProtocols(client: PublicClient, token: string) {
  const { summary } = await fetchMarketsData(client, {})
  const upper = token.toUpperCase()
  const matching = summary.markets.filter((m) => m.assetSymbol.toUpperCase() === upper)

  const recommendations = matching.map((m) => ({
    protocol: m.type,
    market: m.address,
    token: m.assetSymbol,
    supplyAPY: m.supplyAPY,
    borrowAPY: m.type !== 'mewler-earn' ? m.borrowAPY : null,
    utilization: 'utilization' in m ? m.utilization : null,
    totalAssetsUSD: m.totalAssetsUSD,
    totalBorrowsUSD: m.totalBorrowsUSD,
    supplyCap: 'supplyCap' in m ? m.supplyCap : null,
    borrowCap: 'borrowCap' in m ? m.borrowCap : null,
    maxLTV: 'maxLTV' in m ? m.maxLTV : null,
  }))

  recommendations.sort((a, b) => b.supplyAPY - a.supplyAPY)

  return {
    intent: 'compare_protocols',
    params: { token },
    recommendations,
    summary: {
      protocolCount: recommendations.length,
      bestSupplyAPY: recommendations[0]?.supplyAPY ?? null,
      bestBorrowAPY: recommendations.filter((r) => r.borrowAPY !== null).sort((a, b) => (a.borrowAPY ?? 0) - (b.borrowAPY ?? 0))[0]
        ?.borrowAPY ?? null,
    },
    meta: meta(),
  }
}
