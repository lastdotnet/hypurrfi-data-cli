import { type Address, type PublicClient, formatUnits } from 'viem'
import { calculateUtilization, eulerBorrowAPY, eulerSupplyAPY } from '../calculations/apy'
import { accountLensAbi, eEarnVaultAbi, eVaultAbi, eulerOraclePriceAbi, evcAbi } from '../config/abis'
import { DEFAULT_DECIMALS, PRICE_DECIMALS } from '../config/constants'
import { EVC_ADDRESS, MEWLER_USD_UNIT_OF_ACCOUNT, resolveMarket } from '../config/contracts'
import { LENS_ADDRESSES } from '../config/lens-abis'
import type {
  AccountLensInfo,
  MewlerBorrowPosition,
  MewlerCollateralPosition,
  MewlerEarnPosition,
  MewlerSubAccountPosition,
  UserPositionSummary,
} from '../types'
import { fetchTokenMetadata } from '../utils/token-metadata'
import { discoverMewlerEarnVaults, discoverMewlerLendVaults } from '../utils/vault-discovery'
import { fetchIsolatedUserPositions } from './isolated'
import { fetchPooledUserPosition } from './pooled'
import { fetchAaveOraclePrices, fetchAssetPrices } from './prices'

function getSubAccountAddress(owner: Address, subAccountId: number): Address {
  if (subAccountId === 0) return owner
  const subAccountBigInt = BigInt(owner) ^ BigInt(subAccountId)
  return `0x${subAccountBigInt.toString(16).padStart(40, '0')}` as Address
}

// ── Main orchestrator ──────────────────────────────────────────────

export async function fetchUserPositions(client: PublicClient, userAddress: Address): Promise<UserPositionSummary> {
  const [pooled, mewlerPositions, mewlerEarnPositions, isolatedPositions] = await Promise.all([
    fetchPooledUserPosition(client, userAddress),
    fetchMewlerPositions(client, userAddress),
    fetchMewlerEarnPositions(client, userAddress),
    fetchIsolatedUserPositions(client, userAddress),
  ])

  return { address: userAddress, pooled, mewlerPositions, mewlerEarnPositions, isolatedPositions }
}

// ── Mewler positions (grouped by sub-account) ─────────────────────

interface RawVaultBalance {
  vault: Address
  subAccountId: number
  balance: bigint
  debt: bigint
}

async function fetchMewlerPositions(client: PublicClient, userAddress: Address): Promise<MewlerSubAccountPosition[]> {
  const [vaultAddresses, activeSubAccountIds] = await Promise.all([
    discoverMewlerLendVaults(client),
    discoverActiveSubAccounts(client, userAddress),
  ])
  if (vaultAddresses.length === 0 || activeSubAccountIds.length === 0) return []

  const rawPositions = await scanVaultBalances(client, vaultAddresses, userAddress, activeSubAccountIds)
  if (rawPositions.length === 0) return []

  const positionVaults = [...new Set(rawPositions.map((p) => p.vault))]

  const vaultMeta = await fetchVaultMetadata(client, positionVaults)
  const assetAddrs = [...new Set([...vaultMeta.values()].map((m) => m.asset))]
  const tokenMeta = await fetchTokenMetadata(client, assetAddrs)

  // Use each vault's own oracle for pricing (matches what the account lens / UI uses)
  const assetPrices = await fetchPricesFromVaultOracles(client, vaultMeta, tokenMeta)

  // Aave oracle fallback for any assets still unpriced
  const unpricedAddrs = assetAddrs.filter((a) => !assetPrices.has(a.toLowerCase()))
  if (unpricedAddrs.length > 0) {
    const aavePrices = await fetchAaveOraclePrices(client, unpricedAddrs)
    for (const [key, price] of aavePrices) {
      if (!assetPrices.has(key)) assetPrices.set(key, price)
    }
  }

  for (const meta of vaultMeta.values()) {
    meta.assetSymbol = tokenMeta.get(meta.asset.toLowerCase())?.symbol ?? 'UNKNOWN'
  }

  // Fetch EVC collaterals + controllers per active sub-account
  const subAccountAddresses = activeSubAccountIds.map((id) => getSubAccountAddress(userAddress, id))
  const evcCalls = subAccountAddresses.flatMap((sub) => [
    { address: EVC_ADDRESS, abi: evcAbi, functionName: 'getControllers' as const, args: [sub] as const },
    { address: EVC_ADDRESS, abi: evcAbi, functionName: 'getCollaterals' as const, args: [sub] as const },
  ])
  const evcResults = await client.multicall({ contracts: evcCalls, allowFailure: true })

  const controllerMap = new Map<number, Address | null>()
  const enabledCollateralsMap = new Map<number, Set<string>>()

  for (let i = 0; i < activeSubAccountIds.length; i++) {
    const subId = activeSubAccountIds[i]!
    const controllersRes = evcResults[i * 2]
    const collateralsRes = evcResults[i * 2 + 1]

    const controllers = controllersRes?.status === 'success' ? (controllersRes.result as Address[]) : []
    controllerMap.set(subId, controllers.length > 0 ? controllers[0]! : null)

    const enabledAddrs = collateralsRes?.status === 'success' ? (collateralsRes.result as Address[]) : []
    enabledCollateralsMap.set(subId, new Set(enabledAddrs.map((a) => a.toLowerCase())))
  }

  const healthFactorMap = await fetchMewlerHealthFactors(client, userAddress, activeSubAccountIds, controllerMap)

  // Group raw positions by sub-account
  const positionsBySubAccount = new Map<number, RawVaultBalance[]>()
  for (const rp of rawPositions) {
    const existing = positionsBySubAccount.get(rp.subAccountId) ?? []
    existing.push(rp)
    positionsBySubAccount.set(rp.subAccountId, existing)
  }

  const result: MewlerSubAccountPosition[] = []

  for (const subId of activeSubAccountIds) {
    const positions = positionsBySubAccount.get(subId)
    if (!positions || positions.length === 0) continue

    const subAddr = getSubAccountAddress(userAddress, subId)
    const controller = controllerMap.get(subId) ?? null
    const enabledSet = enabledCollateralsMap.get(subId) ?? new Set()

    const collaterals: MewlerCollateralPosition[] = []
    const borrows: MewlerBorrowPosition[] = []

    for (const rp of positions) {
      const meta = vaultMeta.get(rp.vault.toLowerCase())
      if (!meta) continue

      const assetDec = tokenMeta.get(meta.asset.toLowerCase())?.decimals ?? DEFAULT_DECIMALS
      const price = assetPrices.get(meta.asset.toLowerCase()) ?? 0

      if (rp.balance > 0n) {
        const balFormatted = Number(formatUnits(rp.balance, meta.decimals))
        collaterals.push({
          vaultAddress: rp.vault,
          vaultName: meta.name,
          market: resolveMarket(rp.vault),
          assetSymbol: meta.assetSymbol,
          balance: balFormatted.toString(),
          balanceUSD: balFormatted * meta.sharePrice * price,
          supplyAPY: meta.supplyAPY,
          isEnabled: enabledSet.has(rp.vault.toLowerCase()),
        })
      }

      if (rp.debt > 0n) {
        const debtFormatted = Number(formatUnits(rp.debt, assetDec))
        borrows.push({
          vaultAddress: rp.vault,
          vaultName: meta.name,
          market: resolveMarket(rp.vault),
          assetSymbol: meta.assetSymbol,
          debt: debtFormatted.toString(),
          borrowUSD: debtFormatted * price,
          borrowAPY: meta.borrowAPY,
        })
      }
    }

    const totalCollateralUSD = collaterals.reduce((s, c) => s + c.balanceUSD, 0)
    const totalBorrowUSD = borrows.reduce((s, b) => s + b.borrowUSD, 0)
    const healthFactor = healthFactorMap.get(subId) ?? null

    result.push({
      subAccountId: subId,
      subAccountAddress: subAddr,
      controller,
      healthFactor,
      totalCollateralUSD,
      totalBorrowUSD,
      collaterals,
      borrows,
    })
  }

  return result
}

// ── Mewler earn positions ──────────────────────────────────────────

async function fetchMewlerEarnPositions(client: PublicClient, userAddress: Address): Promise<MewlerEarnPosition[]> {
  const earnVaults = await discoverMewlerEarnVaults(client)
  if (earnVaults.length === 0) return []

  const balResults = await client.multicall({
    contracts: earnVaults.map((v) => ({
      address: v,
      abi: eEarnVaultAbi,
      functionName: 'balanceOf' as const,
      args: [userAddress] as const,
    })),
    allowFailure: true,
  })

  const activeVaults: { address: Address; balance: bigint }[] = []
  for (let i = 0; i < earnVaults.length; i++) {
    const bal = balResults[i]?.status === 'success' ? (balResults[i]!.result as bigint) : 0n
    if (bal > 0n) activeVaults.push({ address: earnVaults[i]!, balance: bal })
  }
  if (activeVaults.length === 0) return []

  const metaCalls = activeVaults.flatMap((v) => [
    { address: v.address, abi: eEarnVaultAbi, functionName: 'name' as const },
    { address: v.address, abi: eEarnVaultAbi, functionName: 'asset' as const },
    { address: v.address, abi: eEarnVaultAbi, functionName: 'decimals' as const },
    { address: v.address, abi: eEarnVaultAbi, functionName: 'convertToAssets' as const, args: [BigInt(1e18)] as const },
  ])
  const metaResults = await client.multicall({ contracts: metaCalls, allowFailure: true })

  const vaultInfos: { name: string; asset: Address | null; decimals: number; sharePrice: number }[] = []
  const assetAddrs = new Set<Address>()

  for (let i = 0; i < activeVaults.length; i++) {
    const base = i * 4
    const name = metaResults[base]?.status === 'success' ? (metaResults[base]!.result as string) : 'Earn Vault'
    const asset = metaResults[base + 1]?.status === 'success' ? (metaResults[base + 1]!.result as Address) : null
    const decimals =
      metaResults[base + 2]?.status === 'success' ? (metaResults[base + 2]!.result as number) : DEFAULT_DECIMALS
    const convertRes = metaResults[base + 3]
    const sharePrice =
      convertRes?.status === 'success' ? Number(formatUnits(convertRes.result as bigint, DEFAULT_DECIMALS)) : 1

    vaultInfos.push({ name, asset, decimals, sharePrice })
    if (asset) assetAddrs.add(asset)
  }

  const assetArr = [...assetAddrs]
  const tokenMeta = await fetchTokenMetadata(client, assetArr)
  const prices = await fetchAssetPrices(
    client,
    assetArr.map((a) => ({ address: a, decimals: tokenMeta.get(a.toLowerCase())?.decimals ?? DEFAULT_DECIMALS })),
  )

  return activeVaults.map((av, i) => {
    const info = vaultInfos[i]!
    const assetKey = info.asset?.toLowerCase() ?? ''
    const meta = tokenMeta.get(assetKey)
    const balFormatted = Number(formatUnits(av.balance, info.decimals))
    const priceUSD = prices.get(assetKey) ?? 0

    return {
      vaultAddress: av.address,
      vaultName: info.name,
      market: resolveMarket(av.address),
      assetSymbol: meta?.symbol ?? 'UNKNOWN',
      balance: balFormatted.toString(),
      balanceUSD: balFormatted * info.sharePrice * priceUSD,
    }
  })
}

// ── Shared helpers ─────────────────────────────────────────────────

const DISCOVERY_BATCH_SIZE = 32
const FALLBACK_SUBACCOUNT_RANGE = 16

async function discoverActiveSubAccounts(client: PublicClient, userAddress: Address): Promise<number[]> {
  const active = new Set<number>()

  // Always include fallback range 0–15 (covers deposit-only positions without controllers)
  for (let i = 0; i < FALLBACK_SUBACCOUNT_RANGE; i++) active.add(i)

  // Scan all 256 sub-accounts for controllers to discover positions beyond the fallback range
  for (let batchStart = 0; batchStart < 256; batchStart += DISCOVERY_BATCH_SIZE) {
    const batchSize = Math.min(DISCOVERY_BATCH_SIZE, 256 - batchStart)
    const contracts = Array.from({ length: batchSize }, (_, i) => ({
      address: EVC_ADDRESS,
      abi: evcAbi,
      functionName: 'getControllers' as const,
      args: [getSubAccountAddress(userAddress, batchStart + i)] as const,
    }))

    const results = await client.multicall({ contracts, allowFailure: true })
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.status === 'success') {
        const controllers = results[i]!.result as Address[]
        if (controllers.length > 0) {
          active.add(batchStart + i)
        }
      }
    }
  }

  return [...active].sort((a, b) => a - b)
}

async function scanVaultBalances(
  client: PublicClient,
  vaultAddresses: Address[],
  userAddress: Address,
  subAccountIds: number[],
): Promise<RawVaultBalance[]> {
  const subAccounts = subAccountIds.map((id) => getSubAccountAddress(userAddress, id))

  const balanceCalls = vaultAddresses.flatMap((vault) =>
    subAccounts.flatMap((sub) => [
      { address: vault, abi: eVaultAbi, functionName: 'balanceOf' as const, args: [sub] as const },
      { address: vault, abi: eVaultAbi, functionName: 'debtOf' as const, args: [sub] as const },
    ]),
  )

  const results = await client.multicall({ contracts: balanceCalls, allowFailure: true })
  const positions: RawVaultBalance[] = []

  for (let v = 0; v < vaultAddresses.length; v++) {
    for (let s = 0; s < subAccounts.length; s++) {
      const idx = (v * subAccounts.length + s) * 2
      const bal = results[idx]?.status === 'success' ? (results[idx]!.result as bigint) : 0n
      const debt = results[idx + 1]?.status === 'success' ? (results[idx + 1]!.result as bigint) : 0n

      if (bal > 0n || debt > 0n) {
        positions.push({ vault: vaultAddresses[v]!, subAccountId: subAccountIds[s]!, balance: bal, debt })
      }
    }
  }

  return positions
}

interface VaultMetaEntry {
  name: string
  asset: Address
  decimals: number
  sharePrice: number
  supplyAPY: number
  borrowAPY: number
  assetSymbol: string
  oracle: Address | null
}

async function fetchVaultMetadata(
  client: PublicClient,
  vaultAddresses: Address[],
): Promise<Map<string, VaultMetaEntry>> {
  const FIELDS = 9
  const calls = vaultAddresses.flatMap((v) => [
    { address: v, abi: eVaultAbi, functionName: 'name' as const },
    { address: v, abi: eVaultAbi, functionName: 'asset' as const },
    { address: v, abi: eVaultAbi, functionName: 'decimals' as const },
    { address: v, abi: eVaultAbi, functionName: 'convertToAssets' as const, args: [BigInt(1e18)] as const },
    { address: v, abi: eVaultAbi, functionName: 'interestRate' as const },
    { address: v, abi: eVaultAbi, functionName: 'interestFee' as const },
    { address: v, abi: eVaultAbi, functionName: 'totalBorrows' as const },
    { address: v, abi: eVaultAbi, functionName: 'totalAssets' as const },
    { address: v, abi: eVaultAbi, functionName: 'oracle' as const },
  ])
  const results = await client.multicall({ contracts: calls, allowFailure: true })

  const map = new Map<string, VaultMetaEntry>()
  for (let i = 0; i < vaultAddresses.length; i++) {
    const base = i * FIELDS
    const name = results[base]?.status === 'success' ? (results[base]!.result as string) : 'Unknown'
    const asset = results[base + 1]?.status === 'success' ? (results[base + 1]!.result as Address) : ('0x0' as Address)
    const decimals = results[base + 2]?.status === 'success' ? (results[base + 2]!.result as number) : DEFAULT_DECIMALS
    const convertRes = results[base + 3]
    const sharePrice =
      convertRes?.status === 'success' ? Number(formatUnits(convertRes.result as bigint, DEFAULT_DECIMALS)) : 1
    const interestRate = results[base + 4]?.status === 'success' ? (results[base + 4]!.result as bigint) : 0n
    const interestFee =
      results[base + 5]?.status === 'success' ? BigInt(results[base + 5]!.result as number | bigint) : 0n
    const totalBorrows = results[base + 6]?.status === 'success' ? (results[base + 6]!.result as bigint) : 0n
    const totalAssets = results[base + 7]?.status === 'success' ? (results[base + 7]!.result as bigint) : 0n

    const oracle =
      results[base + 8]?.status === 'success' ? (results[base + 8]!.result as Address) : null

    const utilization = calculateUtilization(totalBorrows, totalAssets)

    map.set(vaultAddresses[i]!.toLowerCase(), {
      name,
      asset,
      decimals,
      sharePrice,
      supplyAPY: totalAssets > 0n ? eulerSupplyAPY(interestRate, utilization, interestFee) : 0,
      borrowAPY: eulerBorrowAPY(interestRate),
      assetSymbol: '',
      oracle,
    })
  }

  return map
}

/**
 * Price assets using each vault's own oracle via getQuote.
 * This matches the oracle the account lens / UI uses for health factor calculations.
 */
async function fetchPricesFromVaultOracles(
  client: PublicClient,
  vaultMeta: Map<string, VaultMetaEntry>,
  tokenMeta: Map<string, { symbol: string; decimals: number }>,
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>()
  const oraclePairs: { asset: Address; oracle: Address; decimals: number }[] = []

  for (const meta of vaultMeta.values()) {
    const key = meta.asset.toLowerCase()
    if (!meta.oracle) continue
    const dec = tokenMeta.get(key)?.decimals ?? DEFAULT_DECIMALS
    if (!oraclePairs.some((u) => u.asset.toLowerCase() === key)) {
      oraclePairs.push({ asset: meta.asset, oracle: meta.oracle, decimals: dec })
    }
  }
  if (oraclePairs.length === 0) return priceMap

  const calls = oraclePairs.map((u) => ({
    address: u.oracle,
    abi: eulerOraclePriceAbi,
    functionName: 'getQuote' as const,
    args: [BigInt(10 ** u.decimals), u.asset, MEWLER_USD_UNIT_OF_ACCOUNT] as const,
  }))
  const results = await client.multicall({ contracts: calls, allowFailure: true })

  for (let i = 0; i < oraclePairs.length; i++) {
    if (results[i]?.status === 'success') {
      const price = Number(formatUnits(results[i]!.result as bigint, PRICE_DECIMALS))
      if (price > 0) priceMap.set(oraclePairs[i]!.asset.toLowerCase(), price)
    }
  }

  return priceMap
}

async function fetchMewlerHealthFactors(
  client: PublicClient,
  userAddress: Address,
  subAccountIds: number[],
  controllerMap: Map<number, Address | null>,
): Promise<Map<number, number>> {
  const map = new Map<number, number>()

  // Only query for sub-accounts with a controller (meaning they have debt)
  const debtSubAccounts = subAccountIds.filter((id) => controllerMap.get(id) != null)
  if (debtSubAccounts.length === 0) return map

  const hfCalls = debtSubAccounts.map((subId) => ({
    address: LENS_ADDRESSES.accountLens,
    abi: accountLensAbi,
    functionName: 'getAccountInfo' as const,
    args: [subId === 0 ? userAddress : getSubAccountAddress(userAddress, subId), controllerMap.get(subId)!] as const,
  }))
  const hfResults = await client.multicall({ contracts: hfCalls, allowFailure: true })

  for (let i = 0; i < debtSubAccounts.length; i++) {
    const subId = debtSubAccounts[i]!
    const res = hfResults[i]
    if (res?.status !== 'success') continue

    const info = res.result as AccountLensInfo
    const liq = info.vaultAccountInfo?.liquidityInfo
    if (!liq || liq.queryFailure) continue

    if (liq.liabilityValueLiquidation > 0n) {
      const hf =
        Number(formatUnits(liq.collateralValueLiquidation, DEFAULT_DECIMALS)) /
        Number(formatUnits(liq.liabilityValueLiquidation, DEFAULT_DECIMALS))
      map.set(subId, hf)
    }
  }

  return map
}
