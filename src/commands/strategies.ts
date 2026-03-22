import type { PublicClient } from 'viem'
import { fetchMarketsData } from './markets.js'
import { type OutputFormat, print, printCSV, success } from '../output.js'
import type { MewlerEarnVault } from '../types.js'

import { normalizeSymbol } from '../utils/normalize.js'

export interface StrategiesOptions {
  asset?: string | undefined
  vault?: string | undefined
}

export interface StrategyDetail {
  vaultAddress: string
  vaultName: string
  vaultAsset: string
  vaultAPY: number
  performanceFee: string
  curator: string | null
  strategyAddress: string
  strategyName: string | null
  allocationShare: number
  supplyAPY: number
  utilization: number
  isEscrow: boolean
}

export async function fetchStrategiesData(client: PublicClient, opts: StrategiesOptions) {
  const { summary } = await fetchMarketsData(client, { type: 'mewler-earn' })
  let vaults = summary.markets.filter((m): m is MewlerEarnVault => m.type === 'mewler-earn')

  if (opts.asset) {
    const upper = opts.asset.toUpperCase()
    vaults = vaults.filter((v) => normalizeSymbol(v.assetSymbol).includes(normalizeSymbol(upper)))
  }
  if (opts.vault) {
    const lower = opts.vault.toLowerCase()
    vaults = vaults.filter((v) => v.address.toLowerCase() === lower)
  }

  const strategies: StrategyDetail[] = []
  for (const v of vaults) {
    for (const s of v.strategies) {
      strategies.push({
        vaultAddress: v.address,
        vaultName: v.name,
        vaultAsset: v.assetSymbol,
        vaultAPY: v.supplyAPY,
        performanceFee: v.performanceFee,
        curator: v.curator,
        strategyAddress: s.address,
        strategyName: s.name,
        allocationShare: s.allocationShare,
        supplyAPY: s.supplyAPY,
        utilization: s.utilization,
        isEscrow: s.isEscrow,
      })
    }
  }

  return {
    vaultCount: vaults.length,
    strategyCount: strategies.length,
    strategies,
  }
}

export async function strategiesCommand(
  client: PublicClient,
  opts: StrategiesOptions,
  format: OutputFormat = 'json',
): Promise<void> {
  const data = await fetchStrategiesData(client, opts)

  if (format === 'csv') {
    printCSV(data.strategies.map((s) => ({ ...s })))
    return
  }

  print(success(data))
}
