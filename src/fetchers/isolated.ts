import { type Address, type PublicClient, formatUnits } from 'viem'
import { isolatedBorrowAPY, isolatedDepositAPY } from '../calculations/apy.js'
import { fraxOracleAbi, isolatedPairAbi, isolatedRegistryAbi } from '../config/abis.js'
import { DEFAULT_DECIMALS, ISOLATED_LTV_PRECISION } from '../config/constants.js'
import { ISOLATED_REGISTRY_ADDRESS } from '../config/contracts.js'
import type { IsolatedMarket, IsolatedRateInfo, IsolatedUserPosition } from '../types.js'
import { fetchTokenMetadata } from '../utils/token-metadata.js'
import { fetchAssetPrices } from './prices.js'

const FIELDS_PER_PAIR = 10

// ── Market fetching ────────────────────────────────────────────────

export async function fetchIsolatedMarkets(client: PublicClient): Promise<IsolatedMarket[]> {
  const pairAddresses = await fetchAllPairAddresses(client)
  if (pairAddresses.length === 0) return []

  const dataCalls = pairAddresses.flatMap((addr) => [
    { address: addr, abi: isolatedPairAbi, functionName: 'name' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'asset' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'collateralContract' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'getPairAccounting' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'previewAddInterest' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'maxLTV' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'borrowLimit' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'depositLimit' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'exchangeRateInfo' as const },
    { address: addr, abi: isolatedPairAbi, functionName: 'getConstants' as const },
  ])

  const results = await client.multicall({ contracts: dataCalls, allowFailure: true })

  const parsed = parsePairData(pairAddresses, results)

  // Batch-fetch oracle prices
  const oracleResults = await fetchOraclePrices(client, parsed)

  // Batch-fetch token metadata
  const allTokenAddrs = new Set<Address>()
  for (const p of parsed) {
    allTokenAddrs.add(p.assetAddress)
    allTokenAddrs.add(p.collateralAddress)
  }
  const tokenMeta = await fetchTokenMetadata(client, [...allTokenAddrs])

  return parsed.map((p, i) => buildIsolatedMarket(p, oracleResults[i], tokenMeta))
}

// ── User positions ─────────────────────────────────────────────────

export async function fetchIsolatedUserPositions(
  client: PublicClient,
  userAddress: Address,
): Promise<IsolatedUserPosition[]> {
  const pairAddresses = await fetchAllPairAddresses(client)
  if (pairAddresses.length === 0) return []

  const [snapResults, nameResults] = await Promise.all([
    client.multicall({
      contracts: pairAddresses.map((addr) => ({
        address: addr,
        abi: isolatedPairAbi,
        functionName: 'getUserSnapshot' as const,
        args: [userAddress] as const,
      })),
      allowFailure: true,
    }),
    client.multicall({
      contracts: pairAddresses.map((addr) => ({
        address: addr,
        abi: isolatedPairAbi,
        functionName: 'name' as const,
      })),
      allowFailure: true,
    }),
  ])

  const activePairs = filterActivePairs(pairAddresses, snapResults, nameResults)
  if (activePairs.length === 0) return []

  const pairMetas = await fetchPairMetaForHealthFactor(client, activePairs)

  // Collect token addresses, fetch metadata
  const tokenAddrs = new Set<Address>()
  for (const pm of pairMetas) {
    tokenAddrs.add(pm.assetAddress)
    tokenAddrs.add(pm.collateralAddress)
  }
  const tokenMeta = await fetchTokenMetadata(client, [...tokenAddrs])

  // Batch-fetch oracle prices + USD prices in parallel
  const [oracleResults, assetPrices] = await Promise.all([
    fetchOraclePrices(
      client,
      pairMetas.map((pm) => ({ oracleAddress: pm.oracleAddress, assetAddress: pm.assetAddress })),
    ),
    fetchAssetPrices(
      client,
      [...tokenAddrs].map((a) => ({
        address: a,
        decimals: tokenMeta.get(a.toLowerCase())?.decimals ?? DEFAULT_DECIMALS,
      })),
    ),
  ])

  // Cross-price collateral via exchange rate
  for (let i = 0; i < pairMetas.length; i++) {
    const pm = pairMetas[i]!
    const borrowDecimals = tokenMeta.get(pm.assetAddress.toLowerCase())?.decimals ?? DEFAULT_DECIMALS
    const collDecimals = tokenMeta.get(pm.collateralAddress.toLowerCase())?.decimals ?? DEFAULT_DECIMALS
    const exchRate = computeExchangeRate(pm, oracleResults[i], borrowDecimals, collDecimals)

    const assetKey = pm.assetAddress.toLowerCase()
    const collKey = pm.collateralAddress.toLowerCase()
    const aPrice = assetPrices.get(assetKey) ?? 0
    const cPrice = assetPrices.get(collKey) ?? 0

    if (cPrice === 0 && aPrice > 0 && exchRate > 0) {
      assetPrices.set(collKey, aPrice / exchRate)
    } else if (aPrice === 0 && cPrice > 0 && exchRate > 0) {
      assetPrices.set(assetKey, cPrice * exchRate)
    }
  }

  return activePairs.map((ap, i) => {
    const pm = pairMetas[i]!
    const assetMeta = tokenMeta.get(pm.assetAddress.toLowerCase())
    const collMeta = tokenMeta.get(pm.collateralAddress.toLowerCase())
    const borrowDecimals = assetMeta?.decimals ?? DEFAULT_DECIMALS
    const collateralDecimals = collMeta?.decimals ?? DEFAULT_DECIMALS

    const borrowAmount = computeBorrowAmount(ap.borrowShares, pm.totalBorrow, pm.totalBorrowShares)
    const depositAmount = computeDepositAmount(ap.assetShares, pm.totalAssetAmount, pm.totalAssetShares)
    const exchangeRate = computeExchangeRate(pm, oracleResults[i], borrowDecimals, collateralDecimals)
    const healthFactor = computeHealthFactor(
      ap.collateralBalance,
      collateralDecimals,
      borrowAmount,
      borrowDecimals,
      exchangeRate,
      pm.maxLTV,
    )

    const assetPrice = assetPrices.get(pm.assetAddress.toLowerCase()) ?? 0
    const collateralUnitPrice = exchangeRate > 0 ? 1 / exchangeRate : 0
    const collateralPrice = collateralUnitPrice > 0 && assetPrice > 0 ? assetPrice * collateralUnitPrice : 0

    const depositFormatted = Number(formatUnits(depositAmount, borrowDecimals))
    const borrowFormatted = Number(formatUnits(borrowAmount, borrowDecimals))
    const collateralFormatted = Number(formatUnits(ap.collateralBalance, collateralDecimals))

    return {
      pairAddress: ap.address,
      pairName: ap.name,
      assetSymbol: assetMeta?.symbol ?? 'UNKNOWN',
      collateralSymbol: collMeta?.symbol ?? 'UNKNOWN',
      depositShares: ap.assetShares.toString(),
      depositUSD: depositFormatted * assetPrice,
      borrowShares: ap.borrowShares.toString(),
      borrowAmount: borrowAmount.toString(),
      borrowUSD: borrowFormatted * assetPrice,
      collateralBalance: ap.collateralBalance.toString(),
      collateralUSD: collateralFormatted * collateralPrice,
      maxLTV: pm.maxLTV * 100,
      healthFactor,
    }
  })
}

// ── Shared helpers ─────────────────────────────────────────────────

async function fetchAllPairAddresses(client: PublicClient): Promise<Address[]> {
  try {
    const result = await client.readContract({
      address: ISOLATED_REGISTRY_ADDRESS,
      abi: isolatedRegistryAbi,
      functionName: 'getAllPairAddresses',
    })
    return (result as Address[]) ?? []
  } catch {
    return []
  }
}

interface PairParsed {
  address: Address
  name: string
  assetAddress: Address
  collateralAddress: Address
  totalAssetAmount: bigint
  totalAssetShares: bigint
  totalBorrowAmount: bigint
  totalBorrowShares: bigint
  totalCollateral: bigint
  borrowAPY: number
  supplyAPY: number
  utilization: number
  maxLTV: number
  borrowCap: bigint
  supplyCap: bigint
  oracleAddress: Address | null
  lowExchangeRate: bigint
  exchangePrecision: bigint
}

function parsePairData(pairAddresses: Address[], results: any[]): PairParsed[] {
  const parsed: PairParsed[] = []

  for (let i = 0; i < pairAddresses.length; i++) {
    const base = i * FIELDS_PER_PAIR
    const assetRes = results[base + 1]
    const collateralRes = results[base + 2]
    const accountingRes = results[base + 3]
    const previewRes = results[base + 4]

    if (
      assetRes?.status !== 'success' ||
      collateralRes?.status !== 'success' ||
      accountingRes?.status !== 'success' ||
      previewRes?.status !== 'success'
    ) {
      continue
    }

    const accounting = accountingRes.result as [bigint, bigint, bigint, bigint, bigint]
    const rateInfo = (previewRes.result as [unknown, unknown, unknown, IsolatedRateInfo])[3]
    const ratePerSec = BigInt(rateInfo.ratePerSec ?? 0)
    const feeToProtocolRate = Number(rateInfo.feeToProtocolRate ?? 0) / ISOLATED_LTV_PRECISION

    const utilization = accounting[0] > 0n ? Number((accounting[2] * 1000000n) / accounting[0]) / 10000 : 0
    const borrowApy = isolatedBorrowAPY(ratePerSec)

    const { oracleAddress, lowExchangeRate } = parseExchangeRateInfo(results[base + 8])
    const exchangePrecision = parseExchangePrecision(results[base + 9])

    const nameRes = results[base]
    const maxLTVRes = results[base + 5]
    const borrowLimitRes = results[base + 6]
    const depositLimitRes = results[base + 7]

    parsed.push({
      address: pairAddresses[i]!,
      name: nameRes?.status === 'success' ? (nameRes.result as string) : `Pair ${pairAddresses[i]!.slice(0, 10)}`,
      assetAddress: assetRes.result as Address,
      collateralAddress: collateralRes.result as Address,
      totalAssetAmount: accounting[0],
      totalAssetShares: accounting[1],
      totalBorrowAmount: accounting[2],
      totalBorrowShares: accounting[3],
      totalCollateral: accounting[4],
      borrowAPY: borrowApy,
      supplyAPY: isolatedDepositAPY(borrowApy, utilization, feeToProtocolRate),
      utilization,
      maxLTV: maxLTVRes?.status === 'success' ? (Number(maxLTVRes.result as bigint) / ISOLATED_LTV_PRECISION) * 100 : 0,
      borrowCap: borrowLimitRes?.status === 'success' ? (borrowLimitRes.result as bigint) : 0n,
      supplyCap: depositLimitRes?.status === 'success' ? (depositLimitRes.result as bigint) : 0n,
      oracleAddress,
      lowExchangeRate,
      exchangePrecision,
    })
  }

  return parsed
}

function parseExchangeRateInfo(res: any): { oracleAddress: Address | null; lowExchangeRate: bigint } {
  if (res?.status !== 'success') return { oracleAddress: null, lowExchangeRate: 0n }
  const erInfo = res.result as unknown as [Address, bigint, bigint, bigint, bigint]
  return { oracleAddress: erInfo[0], lowExchangeRate: erInfo[3] }
}

function parseExchangePrecision(res: any): bigint {
  if (res?.status !== 'success') return 0n
  return (res.result as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint])[4]
}

function buildIsolatedMarket(
  p: PairParsed,
  oracleResult: any,
  tokenMeta: Map<string, { symbol: string; decimals: number }>,
): IsolatedMarket {
  const assetMeta = tokenMeta.get(p.assetAddress.toLowerCase())
  const collMeta = tokenMeta.get(p.collateralAddress.toLowerCase())
  const borrowDecimals = assetMeta?.decimals ?? DEFAULT_DECIMALS
  const collateralDecimals = collMeta?.decimals ?? DEFAULT_DECIMALS

  const rawPrice = resolveOraclePrice(p.lowExchangeRate, oracleResult)
  let exchangeRate = 0
  if (p.exchangePrecision > 0n) {
    exchangeRate = (Number(rawPrice) / Number(p.exchangePrecision)) * 10 ** (borrowDecimals - collateralDecimals)
  }

  return {
    address: p.address,
    type: 'isolated',
    name: p.name,
    assetSymbol: assetMeta?.symbol ?? 'UNKNOWN',
    assetAddress: p.assetAddress,
    assetDecimals: borrowDecimals,
    priceUSD: 0,
    market: 'HypurrFi Isolated',
    entity: 'HypurrFi',
    totalAssets: p.totalAssetAmount.toString(),
    totalBorrows: p.totalBorrowAmount.toString(),
    borrowAPY: p.borrowAPY,
    supplyAPY: p.supplyAPY,
    utilization: p.utilization,
    supplyCap: p.supplyCap.toString(),
    borrowCap: p.borrowCap.toString(),
    collateralSymbol: collMeta?.symbol ?? 'UNKNOWN',
    collateralAddress: p.collateralAddress,
    collateralDecimals,
    collateralPriceUSD: 0,
    totalCollateral: p.totalCollateral.toString(),
    exchangeRate,
    maxLTV: p.maxLTV,
  }
}

// ── User position helpers ──────────────────────────────────────────

interface ActivePair {
  address: Address
  name: string
  assetShares: bigint
  borrowShares: bigint
  collateralBalance: bigint
}

function filterActivePairs(pairAddresses: Address[], snapResults: any[], nameResults: any[]): ActivePair[] {
  const pairs: ActivePair[] = []
  for (let i = 0; i < pairAddresses.length; i++) {
    const snap = snapResults[i]
    if (snap?.status !== 'success') continue
    const [assetShares, borrowShares, collateralBalance] = snap.result as [bigint, bigint, bigint]
    if (assetShares === 0n && borrowShares === 0n && collateralBalance === 0n) continue
    pairs.push({
      address: pairAddresses[i]!,
      name:
        nameResults[i]?.status === 'success'
          ? (nameResults[i]!.result as string)
          : `Pair ${pairAddresses[i]!.slice(0, 10)}`,
      assetShares,
      borrowShares,
      collateralBalance,
    })
  }
  return pairs
}

interface PairMeta {
  totalAssetAmount: bigint
  totalAssetShares: bigint
  totalBorrow: bigint
  totalBorrowShares: bigint
  maxLTV: number
  oracleAddress: Address | null
  lowExchangeRate: bigint
  exchangePrecision: bigint
  assetAddress: Address
  collateralAddress: Address
}

const USER_PAIR_FIELDS = 6

async function fetchPairMetaForHealthFactor(client: PublicClient, activePairs: ActivePair[]): Promise<PairMeta[]> {
  const calls = activePairs.flatMap((p) => [
    { address: p.address, abi: isolatedPairAbi, functionName: 'getPairAccounting' as const },
    { address: p.address, abi: isolatedPairAbi, functionName: 'maxLTV' as const },
    { address: p.address, abi: isolatedPairAbi, functionName: 'exchangeRateInfo' as const },
    { address: p.address, abi: isolatedPairAbi, functionName: 'getConstants' as const },
    { address: p.address, abi: isolatedPairAbi, functionName: 'asset' as const },
    { address: p.address, abi: isolatedPairAbi, functionName: 'collateralContract' as const },
  ])

  const results = await client.multicall({ contracts: calls, allowFailure: true })
  const metas: PairMeta[] = []

  for (let i = 0; i < activePairs.length; i++) {
    const base = i * USER_PAIR_FIELDS
    const accounting =
      results[base]?.status === 'success' ? (results[base]!.result as [bigint, bigint, bigint, bigint, bigint]) : null

    const { oracleAddress, lowExchangeRate } = parseExchangeRateInfo(results[base + 2])

    metas.push({
      totalAssetAmount: accounting?.[0] ?? 0n,
      totalAssetShares: accounting?.[1] ?? 0n,
      totalBorrow: accounting?.[2] ?? 0n,
      totalBorrowShares: accounting?.[3] ?? 0n,
      maxLTV:
        results[base + 1]?.status === 'success'
          ? Number(results[base + 1]!.result as bigint) / ISOLATED_LTV_PRECISION
          : 0,
      oracleAddress,
      lowExchangeRate,
      exchangePrecision: parseExchangePrecision(results[base + 3]),
      assetAddress:
        results[base + 4]?.status === 'success' ? (results[base + 4]!.result as Address) : ('0x0' as Address),
      collateralAddress:
        results[base + 5]?.status === 'success' ? (results[base + 5]!.result as Address) : ('0x0' as Address),
    })
  }

  return metas
}

// ── Oracle + exchange rate helpers ─────────────────────────────────

async function fetchOraclePrices(client: PublicClient, items: { oracleAddress: Address | null }[]): Promise<any[]> {
  const calls = items.map((item) => ({
    address: (item.oracleAddress ?? '0x0000000000000000000000000000000000000000') as Address,
    abi: fraxOracleAbi,
    functionName: 'getPrices' as const,
  }))
  const results = await client.multicall({ contracts: calls, allowFailure: true })
  return results as any[]
}

function resolveOraclePrice(fallbackRate: bigint, oracleResult: any): bigint {
  if (oracleResult?.status === 'success') {
    const prices = oracleResult.result as [boolean, bigint, bigint]
    if (!prices[0]) return prices[1]
  }
  return fallbackRate
}

function computeExchangeRate(
  pm: PairMeta,
  oracleResult: any,
  borrowDecimals: number,
  collateralDecimals: number,
): number {
  const rawPrice = resolveOraclePrice(pm.lowExchangeRate, oracleResult)
  if (pm.exchangePrecision <= 0n) return 0
  return (Number(rawPrice) / Number(pm.exchangePrecision)) * 10 ** (borrowDecimals - collateralDecimals)
}

function computeBorrowAmount(borrowShares: bigint, totalBorrow: bigint, totalBorrowShares: bigint): bigint {
  if (borrowShares <= 0n || totalBorrowShares <= 0n) return 0n
  return (borrowShares * totalBorrow) / totalBorrowShares
}

function computeDepositAmount(assetShares: bigint, totalAssetAmount: bigint, totalAssetShares: bigint): bigint {
  if (assetShares <= 0n || totalAssetShares <= 0n) return 0n
  return (assetShares * totalAssetAmount) / totalAssetShares
}

function computeHealthFactor(
  collateralBalance: bigint,
  collateralDecimals: number,
  borrowAmount: bigint,
  borrowDecimals: number,
  exchangeRate: number,
  maxLTV: number,
): number | null {
  const borrowFormatted = Number(formatUnits(borrowAmount, borrowDecimals))
  if (borrowFormatted <= 0 || maxLTV <= 0 || exchangeRate <= 0) return null

  const collateralFormatted = Number(formatUnits(collateralBalance, collateralDecimals))
  const collateralUnitPrice = 1 / exchangeRate
  return (collateralFormatted * collateralUnitPrice * maxLTV) / borrowFormatted
}
