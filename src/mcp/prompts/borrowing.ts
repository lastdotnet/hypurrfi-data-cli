import type { PublicClient } from 'viem'
import { fetchMarketsData } from '../../commands/markets.js'
import { fetchUserPositionData } from '../../commands/user-positions.js'
import type { IsolatedMarket, Market, MewlerLendMarket, PooledMarket } from '../../types.js'
import { meta } from '../utils.js'

type BorrowableMarket = PooledMarket | MewlerLendMarket | IsolatedMarket

function isBorrowable(m: Market): m is BorrowableMarket {
  return m.type !== 'mewler-earn'
}

export async function borrowAgainstPosition(
  client: PublicClient,
  address: string,
  borrowToken: string,
  collateralToken: string,
  targetLTV: number,
) {
  const [positionData, { summary: marketsData }] = await Promise.all([
    fetchUserPositionData(client, address),
    fetchMarketsData(client, {}),
  ])

  const borrowUpper = borrowToken.toUpperCase()
  const collateralUpper = collateralToken.toUpperCase()

  const borrowMarkets = marketsData.markets
    .filter(isBorrowable)
    .filter((m) => m.assetSymbol.toUpperCase() === borrowUpper)
  borrowMarkets.sort((a, b) => a.borrowAPY - b.borrowAPY)

  let collateralUSD = 0
  if (positionData.pooled) {
    for (const s of positionData.pooled.supplies) {
      if (s.assetSymbol.toUpperCase() === collateralUpper) {
        collateralUSD += s.amountUSD
      }
    }
  }

  const recommendations = borrowMarkets.map((m) => {
    const maxBorrowUSD = collateralUSD * targetLTV
    const maxBorrowAmount = m.priceUSD > 0 ? maxBorrowUSD / m.priceUSD : 0
    return {
      action: 'borrow' as const,
      protocol: m.type,
      market: m.address,
      token: m.assetSymbol,
      apy: m.borrowAPY,
      risk: m.borrowAPY > 15 ? ('high' as const) : m.borrowAPY > 8 ? ('medium' as const) : ('low' as const),
      details: {
        maxBorrowUSD,
        maxBorrowAmount,
        collateralUSD,
        targetLTV,
      },
    }
  })

  return {
    intent: 'borrow_against_position',
    params: { address, borrowToken, collateralToken, targetLTV },
    recommendations,
    summary: {
      collateralUSD,
      cheapestRate: recommendations[0]?.apy ?? null,
      optionCount: recommendations.length,
    },
    meta: meta(),
  }
}

export async function cheapestBorrow(client: PublicClient, token: string) {
  const { summary } = await fetchMarketsData(client, {})
  const upper = token.toUpperCase()
  const matching = summary.markets
    .filter(isBorrowable)
    .filter((m) => m.assetSymbol.toUpperCase() === upper)
  matching.sort((a, b) => a.borrowAPY - b.borrowAPY)

  const recommendations = matching.map((m) => ({
    action: 'borrow' as const,
    protocol: m.type,
    market: m.address,
    token: m.assetSymbol,
    apy: m.borrowAPY,
    risk: m.borrowAPY > 0.15 ? ('high' as const) : m.borrowAPY > 0.08 ? ('medium' as const) : ('low' as const),
    details: {
      availableLiquidity: m.totalAssetsUSD - m.totalBorrowsUSD,
      utilization: m.utilization,
      totalAssetsUSD: m.totalAssetsUSD,
    },
  }))

  return {
    intent: 'cheapest_borrow',
    params: { token },
    recommendations,
    summary: {
      cheapestAPY: recommendations[0]?.apy ?? null,
      optionCount: recommendations.length,
    },
    meta: meta(),
  }
}

export async function leverageLoop(client: PublicClient, token: string, leverage: number) {
  const { summary } = await fetchMarketsData(client, {})
  const upper = token.toUpperCase()
  const matching = summary.markets
    .filter(isBorrowable)
    .filter((m) => m.assetSymbol.toUpperCase() === upper)

  const recommendations = matching.map((m) => {
    const supplyAPY = m.supplyAPY
    const borrowAPY = m.borrowAPY
    const netAPY = supplyAPY * leverage - borrowAPY * (leverage - 1)
    return {
      action: 'leverage_loop' as const,
      protocol: m.type,
      market: m.address,
      token: m.assetSymbol,
      apy: netAPY,
      risk: leverage > 3 ? ('high' as const) : leverage > 2 ? ('medium' as const) : ('low' as const),
      details: {
        supplyAPY,
        borrowAPY,
        netAPY,
        leverage,
      },
    }
  })

  recommendations.sort((a, b) => b.apy - a.apy)

  return {
    intent: 'leverage_loop',
    params: { token, leverage },
    recommendations,
    summary: {
      bestNetAPY: recommendations[0]?.apy ?? null,
      optionCount: recommendations.length,
    },
    meta: meta(),
  }
}
