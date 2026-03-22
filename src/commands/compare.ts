import type { PublicClient } from 'viem'
import { type OutputFormat, print, printCSV, success } from '../output.js'
import { compareProtocols } from '../mcp/prompts/comparison.js'

export async function compareProtocolsCommand(client: PublicClient, token: string, format: OutputFormat = 'json'): Promise<void> {
  const data = await compareProtocols(client, token)

  if (format === 'csv') {
    printCSV(data.recommendations.map((r) => ({
      protocol: r.protocol,
      market: r.market,
      token: r.token,
      supplyAPY: r.supplyAPY,
      borrowAPY: r.borrowAPY,
      utilization: r.utilization,
      totalAssetsUSD: r.totalAssetsUSD,
      totalBorrowsUSD: r.totalBorrowsUSD,
      supplyCap: r.supplyCap,
      borrowCap: r.borrowCap,
      maxLTV: r.maxLTV,
    })))
    return
  }

  print(success(data))
}
