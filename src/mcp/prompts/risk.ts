import type { PublicClient } from 'viem'
import { fetchMarketsData } from '../../commands/markets.js'
import { fetchUserPositionData } from '../../commands/user-positions.js'
import { meta } from '../utils.js'

export async function healthCheck(client: PublicClient, address: string) {
  const positionData = await fetchUserPositionData(client, address)

  const atRiskPositions: {
    protocol: string
    healthFactor: number | null
    totalCollateralUSD: number
    totalBorrowUSD: number
    recommendation: string
  }[] = []

  if (positionData.pooled && positionData.pooled.healthFactor < 1.5) {
    const p = positionData.pooled
    atRiskPositions.push({
      protocol: 'pooled',
      healthFactor: p.healthFactor,
      totalCollateralUSD: p.totalCollateralUSD,
      totalBorrowUSD: p.totalBorrowUSD,
      recommendation:
        p.healthFactor < 1.1
          ? 'URGENT: Repay debt or add collateral immediately'
          : 'Consider adding collateral or repaying some debt',
    })
  }

  for (const p of positionData.mewler.positions) {
    if (p.healthFactor !== null && p.healthFactor < 1.5) {
      atRiskPositions.push({
        protocol: `mewler (sub-account ${p.subAccountId})`,
        healthFactor: p.healthFactor,
        totalCollateralUSD: p.totalCollateralUSD,
        totalBorrowUSD: p.totalBorrowUSD,
        recommendation:
          p.healthFactor < 1.1
            ? 'URGENT: Repay debt or add collateral immediately'
            : 'Consider adding collateral or repaying some debt',
      })
    }
  }

  for (const p of positionData.isolated.positions) {
    if (p.healthFactor !== null && p.healthFactor < 1.5) {
      atRiskPositions.push({
        protocol: `isolated (${p.pairName})`,
        healthFactor: p.healthFactor,
        totalCollateralUSD: p.collateralUSD,
        totalBorrowUSD: p.borrowUSD,
        recommendation:
          p.healthFactor < 1.1
            ? 'URGENT: Repay debt or add collateral immediately'
            : 'Consider adding collateral or repaying some debt',
      })
    }
  }

  return {
    intent: 'health_check',
    params: { address },
    recommendations: atRiskPositions,
    summary: {
      lowestHealthFactor: positionData.lowestHealthFactor,
      isAtRisk: positionData.isAtRisk,
      atRiskCount: atRiskPositions.length,
    },
    meta: meta(),
  }
}

export async function liquidationPrice(client: PublicClient, address: string, token?: string) {
  const [positionData, { summary: marketsData }] = await Promise.all([
    fetchUserPositionData(client, address),
    fetchMarketsData(client, {}),
  ])

  // Build a price lookup from market data
  const priceBySymbol = new Map<string, number>()
  for (const m of marketsData.markets) {
    if (m.priceUSD > 0) priceBySymbol.set(m.assetSymbol.toUpperCase(), m.priceUSD)
  }

  const upper = token?.toUpperCase()

  const results: {
    protocol: string
    token: string
    currentPrice: number | null
    liquidationPrice: number | null
    bufferPercent: number | null
    healthFactor: number | null
  }[] = []

  // Pooled: estimate liquidation price per collateral asset
  if (positionData.pooled && positionData.pooled.totalBorrowUSD > 0) {
    const p = positionData.pooled
    for (const s of p.supplies) {
      if (upper && s.assetSymbol.toUpperCase() !== upper) continue
      const currentPrice = priceBySymbol.get(s.assetSymbol.toUpperCase()) ?? null
      // Liquidation price ≈ currentPrice / healthFactor (simplified single-asset approximation)
      const liqPrice = currentPrice !== null && p.healthFactor > 0
        ? currentPrice / p.healthFactor
        : null
      const buffer = currentPrice !== null && liqPrice !== null && liqPrice > 0
        ? ((currentPrice - liqPrice) / currentPrice) * 100
        : null
      results.push({
        protocol: 'pooled',
        token: s.assetSymbol,
        currentPrice,
        liquidationPrice: liqPrice,
        bufferPercent: buffer,
        healthFactor: p.healthFactor,
      })
    }
  }

  // Mewler: estimate liquidation price per collateral asset
  for (const p of positionData.mewler.positions) {
    if (p.healthFactor === null || p.totalBorrowUSD === 0) continue
    for (const c of p.collaterals) {
      if (upper && c.assetSymbol.toUpperCase() !== upper) continue
      const currentPrice = priceBySymbol.get(c.assetSymbol.toUpperCase()) ?? null
      const liqPrice = currentPrice !== null && p.healthFactor > 0
        ? currentPrice / p.healthFactor
        : null
      const buffer = currentPrice !== null && liqPrice !== null && liqPrice > 0
        ? ((currentPrice - liqPrice) / currentPrice) * 100
        : null
      results.push({
        protocol: `mewler (sub-account ${p.subAccountId})`,
        token: c.assetSymbol,
        currentPrice,
        liquidationPrice: liqPrice,
        bufferPercent: buffer,
        healthFactor: p.healthFactor,
      })
    }
  }

  // Isolated: has explicit liquidation prices from the protocol
  for (const p of positionData.isolated.positions) {
    if (upper && p.assetSymbol.toUpperCase() !== upper && p.collateralSymbol.toUpperCase() !== upper) continue
    const currentPrice = priceBySymbol.get(p.collateralSymbol.toUpperCase()) ?? null
    const buffer = currentPrice !== null && p.liquidationPrice !== null && p.liquidationPrice > 0
      ? ((currentPrice - p.liquidationPrice) / currentPrice) * 100
      : null
    results.push({
      protocol: `isolated (${p.pairName})`,
      token: p.collateralSymbol,
      currentPrice,
      liquidationPrice: p.liquidationPrice,
      bufferPercent: buffer,
      healthFactor: p.healthFactor,
    })
  }

  return {
    intent: 'liquidation_price',
    params: { address, token: token ?? null },
    recommendations: results,
    summary: {
      positionsAnalyzed: results.length,
    },
    meta: meta(),
  }
}

export async function stressTest(client: PublicClient, address: string, token: string, dropPercent: number) {
  const positionData = await fetchUserPositionData(client, address)
  const dropFactor = 1 - dropPercent / 100

  const results: {
    protocol: string
    currentHF: number | null
    simulatedHF: number | null
    atRisk: boolean
  }[] = []

  if (positionData.pooled) {
    const p = positionData.pooled
    // Simplistic: if the token is in collateral, reduce collateral value
    const hasToken = p.supplies.some((s) => s.assetSymbol.toUpperCase() === token.toUpperCase())
    if (hasToken) {
      const affectedCollateral = p.supplies
        .filter((s) => s.assetSymbol.toUpperCase() === token.toUpperCase())
        .reduce((sum, s) => sum + s.amountUSD, 0)
      const newCollateral = p.totalCollateralUSD - affectedCollateral * (1 - dropFactor)
      // Approximation: scales HF linearly with collateral value change.
      // Actual protocol HF may differ due to per-asset liquidation thresholds.
      const simulatedHF = p.totalBorrowUSD > 0 ? (newCollateral / p.totalCollateralUSD) * p.healthFactor : null
      results.push({
        protocol: 'pooled',
        currentHF: p.healthFactor,
        simulatedHF,
        atRisk: simulatedHF !== null && simulatedHF < 1.0,
      })
    }
  }

  for (const p of positionData.mewler.positions) {
    const hasToken = p.collaterals.some((c) => c.assetSymbol.toUpperCase() === token.toUpperCase())
    if (hasToken && p.healthFactor !== null) {
      const affectedCollateral = p.collaterals
        .filter((c) => c.assetSymbol.toUpperCase() === token.toUpperCase())
        .reduce((sum, c) => sum + c.balanceUSD, 0)
      const newCollateral = p.totalCollateralUSD - affectedCollateral * (1 - dropFactor)
      // Approximation: scales HF linearly with collateral value change.
      const simulatedHF = p.totalBorrowUSD > 0 ? (newCollateral / p.totalCollateralUSD) * p.healthFactor : null
      results.push({
        protocol: `mewler (sub-account ${p.subAccountId})`,
        currentHF: p.healthFactor,
        simulatedHF,
        atRisk: simulatedHF !== null && simulatedHF < 1.0,
      })
    }
  }

  // Isolated positions
  for (const p of positionData.isolated.positions) {
    if (p.healthFactor === null) continue
    const hasCollateralToken = p.collateralSymbol.toUpperCase() === token.toUpperCase()
    if (hasCollateralToken) {
      const newCollateral = p.collateralUSD * dropFactor
      // Approximation: scales HF linearly with collateral value change.
      const simulatedHF = p.borrowUSD > 0 ? (newCollateral / p.collateralUSD) * p.healthFactor : null
      results.push({
        protocol: `isolated (${p.pairName})`,
        currentHF: p.healthFactor,
        simulatedHF,
        atRisk: simulatedHF !== null && simulatedHF < 1.0,
      })
    }
  }

  return {
    intent: 'stress_test',
    params: { address, token, dropPercent },
    recommendations: results,
    summary: {
      positionsAffected: results.length,
      atRiskCount: results.filter((r) => r.atRisk).length,
    },
    meta: meta(),
  }
}
