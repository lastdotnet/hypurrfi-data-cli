import type { PublicClient } from 'viem'
import { CHAIN_ID } from '../config/chain.js'
import { PERFORMANCE_FEE_PRECISION } from '../config/constants.js'
import { resolveEntity, resolveMarket } from '../config/contracts.js'
import { LENS_ADDRESSES, eulerEarnVaultLensAbi } from '../config/lens-abis.js'
import type { EarnVaultLensInfo, MewlerEarnVault, MewlerLendMarket, StrategyInfo } from '../types.js'
import { discoverMewlerEarnVaults } from '../utils/vault-discovery.js'

export async function fetchMewlerEarnVaults(
  client: PublicClient,
  lendMarkets: MewlerLendMarket[],
  _chainId = CHAIN_ID,
): Promise<MewlerEarnVault[]> {
  const vaultAddresses = await discoverMewlerEarnVaults(client)
  if (vaultAddresses.length === 0) return []

  const lendAPYMap = new Map<string, { supplyAPY: number; name: string }>()
  for (const m of lendMarkets) {
    lendAPYMap.set(m.address.toLowerCase(), { supplyAPY: m.supplyAPY, name: m.name })
  }

  const lensCalls = vaultAddresses.map((addr) => ({
    address: LENS_ADDRESSES.eulerEarnVaultLens,
    abi: eulerEarnVaultLensAbi,
    functionName: 'getVaultInfoFull' as const,
    args: [addr] as const,
  }))

  const lensResults = await client.multicall({ contracts: lensCalls, allowFailure: true })

  const vaults: MewlerEarnVault[] = []

  for (let i = 0; i < vaultAddresses.length; i++) {
    const addr = vaultAddresses[i]!
    const res = lensResults[i]
    if (res?.status !== 'success') continue

    const v = res.result as EarnVaultLensInfo
    const { strategies, netAPY } = buildStrategies(v, lendAPYMap)

    vaults.push({
      address: addr,
      type: 'mewler-earn',
      name: v.vaultName,
      assetSymbol: v.assetSymbol,
      assetAddress: v.asset,
      assetDecimals: Number(v.assetDecimals),
      priceUSD: 0,
      market: resolveMarket(addr),
      entity: resolveEntity(v.curator),
      supplyAPY: netAPY,
      totalAssets: v.totalAssets.toString(),
      totalBorrows: '0',
      totalAssetsUSD: 0,
      totalBorrowsUSD: 0,
      curator: v.curator || null,
      strategies,
      performanceFee: v.performanceFee.toString(),
    })
  }

  return vaults
}

function buildStrategies(
  v: EarnVaultLensInfo,
  lendAPYMap: Map<string, { supplyAPY: number; name: string }>,
): { strategies: StrategyInfo[]; netAPY: number } {
  const rawStrategies = v.strategies ?? []
  const totalAllocated = rawStrategies.reduce((sum, s) => sum + BigInt(s.allocatedAssets ?? 0), 0n)

  let weightedAPY = 0
  const strategies: StrategyInfo[] = []

  for (const s of rawStrategies) {
    const allocatedAssets = BigInt(s.allocatedAssets ?? 0)
    const lendInfo = lendAPYMap.get((s.strategy as string).toLowerCase())
    const isEscrow = !lendInfo
    const stratSupplyAPY = lendInfo?.supplyAPY ?? 0
    const weight = totalAllocated > 0n ? Number(allocatedAssets) / Number(totalAllocated) : 0

    strategies.push({
      address: s.strategy,
      name: lendInfo?.name ?? (isEscrow ? (s.info?.isEVault ? 'Escrow (EVault)' : 'Escrow') : null),
      shares: allocatedAssets.toString(),
      allocationShare: weight,
      supplyAPY: stratSupplyAPY,
      isEscrow,
    })

    if (allocatedAssets > 0n) {
      weightedAPY += stratSupplyAPY * weight
    }
  }

  const feePercent = Number(v.performanceFee) / PERFORMANCE_FEE_PRECISION
  return { strategies, netAPY: weightedAPY * (1 - feePercent) }
}
