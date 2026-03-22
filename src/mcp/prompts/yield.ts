import type { PublicClient } from 'viem'
import { fetchMarketsData } from '../../commands/markets.js'
import { fetchUserPositionData } from '../../commands/user-positions.js'
import { PERFORMANCE_FEE_PRECISION } from '../../config/constants.js'
import type { MewlerEarnVault } from '../../types.js'
import { getRiskLevel, meta, normalizeSymbol } from '../utils.js'

export async function maximizeYield(client: PublicClient, token: string) {
  const { summary } = await fetchMarketsData(client, {})
  const upper = normalizeSymbol(token)
  const matching = summary.markets.filter((m) => normalizeSymbol(m.assetSymbol) === upper)
  matching.sort((a, b) => b.supplyAPY - a.supplyAPY)

  const recommendations = matching.map((m) => ({
    action: 'supply' as const,
    protocol: m.type,
    market: m.address,
    token: m.assetSymbol,
    apy: m.supplyAPY,
    risk: getRiskLevel(m),
    details: {
      totalAssetsUSD: m.totalAssetsUSD,
      utilization: 'utilization' in m ? m.utilization : null,
    },
  }))

  return {
    intent: 'maximize_yield',
    params: { token },
    recommendations,
    summary: {
      bestAPY: recommendations[0]?.apy ?? 0,
      optionCount: recommendations.length,
    },
    meta: meta(),
  }
}

export async function optimizePortfolioYield(client: PublicClient, address: string) {
  const [positionData, { summary: marketsData }] = await Promise.all([
    fetchUserPositionData(client, address),
    fetchMarketsData(client, {}),
  ])

  const bestRateByToken = new Map<string, { apy: number; protocol: string; market: string }>()
  const marketRateByAddress = new Map<string, number>()
  for (const m of marketsData.markets) {
    marketRateByAddress.set(m.address.toLowerCase(), m.supplyAPY)
    const sym = normalizeSymbol(m.assetSymbol)
    const existing = bestRateByToken.get(sym)
    if (!existing || m.supplyAPY > existing.apy) {
      bestRateByToken.set(sym, { apy: m.supplyAPY, protocol: m.type, market: m.address })
    }
  }

  const recommendations: {
    action: string
    token: string
    currentAPY: number
    bestAPY: number
    deltaAPY: number
    currentProtocol: string
    bestProtocol: string
    bestMarket: string
  }[] = []

  if (positionData.pooled) {
    for (const s of positionData.pooled.supplies) {
      const best = bestRateByToken.get(normalizeSymbol(s.assetSymbol))
      if (best && best.apy > s.apy) {
        recommendations.push({
          action: 'reallocate',
          token: s.assetSymbol,
          currentAPY: s.apy,
          bestAPY: best.apy,
          deltaAPY: best.apy - s.apy,
          currentProtocol: 'pooled',
          bestProtocol: best.protocol,
          bestMarket: best.market,
        })
      }
    }
  }

  for (const p of positionData.mewler.positions) {
    for (const c of p.collaterals) {
      const best = bestRateByToken.get(normalizeSymbol(c.assetSymbol))
      if (best && best.apy > c.supplyAPY) {
        recommendations.push({
          action: 'reallocate',
          token: c.assetSymbol,
          currentAPY: c.supplyAPY,
          bestAPY: best.apy,
          deltaAPY: best.apy - c.supplyAPY,
          currentProtocol: 'mewler',
          bestProtocol: best.protocol,
          bestMarket: best.market,
        })
      }
    }
  }

  for (const p of positionData.mewlerEarn.positions) {
    const currentAPY = marketRateByAddress.get(p.vaultAddress.toLowerCase()) ?? 0
    const best = bestRateByToken.get(normalizeSymbol(p.assetSymbol))
    if (best && best.apy > currentAPY) {
      recommendations.push({
        action: 'reallocate',
        token: p.assetSymbol,
        currentAPY,
        bestAPY: best.apy,
        deltaAPY: best.apy - currentAPY,
        currentProtocol: 'mewler-earn',
        bestProtocol: best.protocol,
        bestMarket: best.market,
      })
    }
  }

  for (const p of positionData.isolated.positions) {
    if (p.depositUSD <= 0) continue
    const best = bestRateByToken.get(normalizeSymbol(p.assetSymbol))
    if (best && best.apy > p.supplyAPY) {
      recommendations.push({
        action: 'reallocate',
        token: p.assetSymbol,
        currentAPY: p.supplyAPY,
        bestAPY: best.apy,
        deltaAPY: best.apy - p.supplyAPY,
        currentProtocol: 'isolated',
        bestProtocol: best.protocol,
        bestMarket: best.market,
      })
    }
  }

  recommendations.sort((a, b) => b.deltaAPY - a.deltaAPY)

  return {
    intent: 'optimize_portfolio_yield',
    params: { address },
    recommendations,
    summary: {
      positionsAnalyzed: recommendations.length,
      totalDeltaAPY: recommendations.reduce((sum, r) => sum + r.deltaAPY, 0),
    },
    meta: meta(),
  }
}

export async function findEarnStrategies(client: PublicClient, token: string) {
  const { summary } = await fetchMarketsData(client, { type: 'mewler-earn' })
  const upper = normalizeSymbol(token)
  const matching = summary.markets.filter(
    (m): m is MewlerEarnVault => m.type === 'mewler-earn' && normalizeSymbol(m.assetSymbol) === upper,
  )
  matching.sort((a, b) => b.supplyAPY - a.supplyAPY)

  const recommendations = matching.map((m) => ({
    action: 'deposit' as const,
    protocol: 'mewler-earn',
    market: m.address,
    token: m.assetSymbol,
    apy: m.supplyAPY,
    risk: 'low' as const,
    details: {
      curator: m.curator,
      performanceFee: (Number(m.performanceFee) / PERFORMANCE_FEE_PRECISION) * 100,
      strategies: m.strategies.map((s) => ({
        ...s,
        allocationPct: s.allocationShare * 100,
        allocationShare: undefined,
      })),
      totalAssetsUSD: m.totalAssetsUSD,
    },
  }))

  return {
    intent: 'find_earn_strategies',
    params: { token },
    recommendations,
    summary: {
      vaultCount: recommendations.length,
      bestAPY: recommendations[0]?.apy ?? 0,
    },
    meta: meta(),
  }
}
