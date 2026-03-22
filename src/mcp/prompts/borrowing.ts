import type { PublicClient } from 'viem'
import { fetchMarketsData } from '../../commands/markets.js'
import { fetchUserPositionData } from '../../commands/user-positions.js'
import type { IsolatedMarket, Market, MewlerLendMarket, PooledMarket } from '../../types.js'
import { getRiskLevel, meta, normalizeSymbol } from '../utils.js'

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

  const borrowUpper = normalizeSymbol(borrowToken)
  const collateralUpper = normalizeSymbol(collateralToken)

  const borrowMarkets = marketsData.markets
    .filter(isBorrowable)
    .filter((m) => normalizeSymbol(m.assetSymbol) === borrowUpper)
  borrowMarkets.sort((a, b) => a.borrowAPY - b.borrowAPY)

  let collateralUSD = 0
  if (positionData.pooled) {
    for (const s of positionData.pooled.supplies) {
      if (normalizeSymbol(s.assetSymbol) === collateralUpper) {
        collateralUSD += s.amountUSD
      }
    }
  }
  for (const p of positionData.mewler.positions) {
    for (const c of p.collaterals) {
      if (normalizeSymbol(c.assetSymbol) === collateralUpper) {
        collateralUSD += c.balanceUSD
      }
    }
  }
  for (const p of positionData.isolated.positions) {
    if (normalizeSymbol(p.collateralSymbol) === collateralUpper) {
      collateralUSD += p.collateralUSD
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
      risk: getRiskLevel(m),
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
  const upper = normalizeSymbol(token)
  const matching = summary.markets
    .filter(isBorrowable)
    .filter((m) => normalizeSymbol(m.assetSymbol) === upper)
  matching.sort((a, b) => a.borrowAPY - b.borrowAPY)

  const recommendations = matching.map((m) => ({
    action: 'borrow' as const,
    protocol: m.type,
    market: m.address,
    token: m.assetSymbol,
    apy: m.borrowAPY,
    risk: getRiskLevel(m),
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
  const upper = normalizeSymbol(token)
  const matching = summary.markets
    .filter(isBorrowable)
    .filter((m) => normalizeSymbol(m.assetSymbol) === upper)

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
