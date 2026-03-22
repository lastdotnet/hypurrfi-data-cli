import type { PublicClient } from 'viem'
import { type OutputFormat, print, printCSV, success } from '../output.js'
import { borrowAgainstPosition, cheapestBorrow, leverageLoop } from '../mcp/prompts/borrowing.js'

export async function cheapestBorrowCommand(client: PublicClient, token: string, format: OutputFormat = 'json'): Promise<void> {
  const data = await cheapestBorrow(client, token)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      action: r.action,
      protocol: r.protocol,
      market: r.market,
      token: r.token,
      borrowAPY: r.apy,
      risk: r.risk,
      availableLiquidity: r.details.availableLiquidity,
      utilization: r.details.utilization,
      totalAssetsUSD: r.details.totalAssetsUSD,
    })))
    return
  }

  print(success(data))
}

export interface BorrowCapacityOpts {
  borrowToken: string
  collateralToken: string
  targetLtv: string
}

export async function borrowCapacityCommand(
  client: PublicClient,
  address: string,
  opts: BorrowCapacityOpts,
  format: OutputFormat = 'json',
): Promise<void> {
  const ltv = Number(opts.targetLtv)
  if (Number.isNaN(ltv) || ltv <= 0 || ltv >= 1) {
    throw new Error(`target-ltv must be between 0 and 1, got "${opts.targetLtv}"`)
  }

  const data = await borrowAgainstPosition(client, address, opts.borrowToken, opts.collateralToken, ltv)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      action: r.action,
      protocol: r.protocol,
      market: r.market,
      token: r.token,
      borrowAPY: r.apy,
      risk: r.risk,
      maxBorrowUSD: r.details.maxBorrowUSD,
      maxBorrowAmount: r.details.maxBorrowAmount,
      collateralUSD: r.details.collateralUSD,
      targetLTV: r.details.targetLTV,
    })))
    return
  }

  print(success(data))
}

export async function leverageLoopCommand(
  client: PublicClient,
  token: string,
  leverage: string,
  format: OutputFormat = 'json',
): Promise<void> {
  const lev = Number(leverage)
  if (Number.isNaN(lev) || lev < 1) {
    throw new Error(`leverage must be >= 1, got "${leverage}"`)
  }

  const data = await leverageLoop(client, token, lev)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      action: r.action,
      protocol: r.protocol,
      market: r.market,
      token: r.token,
      netAPY: r.apy,
      risk: r.risk,
      supplyAPY: r.details.supplyAPY,
      borrowAPY: r.details.borrowAPY,
      leverage: r.details.leverage,
    })))
    return
  }

  print(success(data))
}
