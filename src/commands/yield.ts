import type { PublicClient } from 'viem'
import { type OutputFormat, print, printCSV, success } from '../output.js'
import { findEarnStrategies, maximizeYield, optimizePortfolioYield } from '../mcp/prompts/yield.js'

export async function maximizeYieldCommand(client: PublicClient, token: string, format: OutputFormat = 'json'): Promise<void> {
  const data = await maximizeYield(client, token)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      action: r.action,
      protocol: r.protocol,
      market: r.market,
      token: r.token,
      apy: r.apy,
      risk: r.risk,
      totalAssetsUSD: r.details.totalAssetsUSD,
      utilization: r.details.utilization,
    })))
    return
  }

  print(success(data))
}

export async function optimizeYieldCommand(client: PublicClient, address: string, format: OutputFormat = 'json'): Promise<void> {
  const data = await optimizePortfolioYield(client, address)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      action: r.action,
      token: r.token,
      currentAPY: r.currentAPY,
      bestAPY: r.bestAPY,
      deltaAPY: r.deltaAPY,
      currentProtocol: r.currentProtocol,
      bestProtocol: r.bestProtocol,
      bestMarket: r.bestMarket,
    })))
    return
  }

  print(success(data))
}

export async function earnStrategiesCommand(client: PublicClient, token: string, format: OutputFormat = 'json'): Promise<void> {
  const data = await findEarnStrategies(client, token)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      action: r.action,
      protocol: r.protocol,
      market: r.market,
      token: r.token,
      apy: r.apy,
      risk: r.risk,
      curator: r.details.curator,
      performanceFee: r.details.performanceFee,
      totalAssetsUSD: r.details.totalAssetsUSD,
    })))
    return
  }

  print(success(data))
}
