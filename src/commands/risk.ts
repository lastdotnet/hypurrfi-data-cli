import type { PublicClient } from 'viem'
import { type OutputFormat, print, printCSV, success } from '../output.js'
import { healthCheck, liquidationPrice, stressTest } from '../mcp/prompts/risk.js'

export async function healthCheckCommand(client: PublicClient, address: string, format: OutputFormat = 'json'): Promise<void> {
  const data = await healthCheck(client, address)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      protocol: r.protocol,
      healthFactor: r.healthFactor,
      totalCollateralUSD: r.totalCollateralUSD,
      totalBorrowUSD: r.totalBorrowUSD,
      recommendation: r.recommendation,
    })))
    return
  }

  print(success(data))
}

export interface LiquidationPriceOpts {
  token?: string
}

export async function liquidationPriceCommand(
  client: PublicClient,
  address: string,
  opts: LiquidationPriceOpts,
  format: OutputFormat = 'json',
): Promise<void> {
  const data = await liquidationPrice(client, address, opts.token)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      protocol: r.protocol,
      token: r.token,
      currentPrice: r.currentPrice,
      liquidationPrice: r.liquidationPrice,
      bufferPercent: r.bufferPercent,
      healthFactor: r.healthFactor,
    })))
    return
  }

  print(success(data))
}

export interface StressTestOpts {
  token: string
  drop: string
}

export async function stressTestCommand(
  client: PublicClient,
  address: string,
  opts: StressTestOpts,
  format: OutputFormat = 'json',
): Promise<void> {
  const drop = Number(opts.drop)
  if (Number.isNaN(drop) || drop <= 0 || drop >= 100) {
    throw new Error(`drop must be between 0 and 100, got "${opts.drop}"`)
  }

  const data = await stressTest(client, address, opts.token, drop)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      protocol: r.protocol,
      currentHF: r.currentHF,
      simulatedHF: r.simulatedHF,
      atRisk: r.atRisk,
    })))
    return
  }

  print(success(data))
}
