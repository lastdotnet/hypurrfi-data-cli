import { type Address, type PublicClient, formatUnits, erc20Abi as viemErc20Abi } from 'viem'
import {
  aaveOracleAbi,
  addressProviderAbi,
  eulerOraclePriceAbi,
  fraxOracleAbi,
  isolatedPairAbi,
  isolatedRegistryAbi,
} from '../config/abis.js'
import { AAVE_ORACLE_DECIMALS, DEFAULT_DECIMALS, PRICE_DECIMALS } from '../config/constants.js'
import { ISOLATED_REGISTRY_ADDRESS } from '../config/contracts.js'
import {
  KNOWN_TOKENS,
  MEWLER_ROUTER_ADDRESS,
  MEWLER_USD_UNIT_OF_ACCOUNT,
  POOL_ADDRESS_PROVIDER,
} from '../config/contracts.js'
import { LENS_ADDRESSES, vaultLensAbi } from '../config/lens-abis.js'
import type { TokenPrice, VaultLensInfo } from '../types.js'
import { discoverMewlerLendVaults } from '../utils/vault-discovery.js'

/**
 * Fetch USD prices for a set of assets in a single multicall.
 * Returns a map of lowercase address -> priceUSD.
 */
export async function fetchAssetPrices(
  client: PublicClient,
  assets: { address: Address; decimals: number }[],
): Promise<Map<string, number>> {
  if (assets.length === 0) return new Map()

  const priceCalls = assets.map((a) => ({
    address: MEWLER_ROUTER_ADDRESS,
    abi: eulerOraclePriceAbi,
    functionName: 'getQuote' as const,
    args: [BigInt(10 ** a.decimals), a.address, MEWLER_USD_UNIT_OF_ACCOUNT] as const,
  }))

  const results = await client.multicall({ contracts: priceCalls, allowFailure: true })

  const priceMap = new Map<string, number>()
  for (let i = 0; i < assets.length; i++) {
    if (results[i]?.status === 'success') {
      priceMap.set(assets[i]!.address.toLowerCase(), Number(formatUnits(results[i]!.result as bigint, 18)))
    }
  }

  // Aave oracle fallback for tokens still missing
  const unpriced = assets.filter((a) => !priceMap.has(a.address.toLowerCase()))
  if (unpriced.length > 0) {
    const aavePrices = await fetchAaveOraclePrices(
      client,
      unpriced.map((a) => a.address),
    )
    for (const [key, price] of aavePrices) {
      if (!priceMap.has(key)) priceMap.set(key, price)
    }
  }

  return priceMap
}

export async function fetchTokenPrices(client: PublicClient, tokenAddresses: Address[]): Promise<TokenPrice[]> {
  if (tokenAddresses.length === 0) return []

  const symbolCalls = tokenAddresses.map((addr) => ({
    address: addr,
    abi: viemErc20Abi,
    functionName: 'symbol' as const,
  }))
  const decimalsCalls = tokenAddresses.map((addr) => ({
    address: addr,
    abi: viemErc20Abi,
    functionName: 'decimals' as const,
  }))

  const [symbolResults, decimalsResults] = await Promise.all([
    client.multicall({ contracts: symbolCalls, allowFailure: true }),
    client.multicall({ contracts: decimalsCalls, allowFailure: true }),
  ])

  const priceCalls = tokenAddresses.map((addr, i) => {
    const known = KNOWN_TOKENS[addr.toLowerCase()]
    const decimalsRes = decimalsResults[i]
    const decimals = known?.decimals ?? (decimalsRes?.status === 'success' ? (decimalsRes.result as number) : 18)

    return {
      address: MEWLER_ROUTER_ADDRESS,
      abi: eulerOraclePriceAbi,
      functionName: 'getQuote' as const,
      args: [BigInt(10 ** decimals), addr, MEWLER_USD_UNIT_OF_ACCOUNT] as const,
    }
  })

  const priceResults = await client.multicall({ contracts: priceCalls, allowFailure: true })

  const prices: TokenPrice[] = []
  for (let i = 0; i < tokenAddresses.length; i++) {
    const addr = tokenAddresses[i]!
    const known = KNOWN_TOKENS[addr.toLowerCase()]
    const symbolRes = symbolResults[i]
    const decimalsRes = decimalsResults[i]
    const priceRes = priceResults[i]

    const symbol = known?.symbol ?? (symbolRes?.status === 'success' ? (symbolRes.result as string) : 'UNKNOWN')
    const decimals = known?.decimals ?? (decimalsRes?.status === 'success' ? (decimalsRes.result as number) : 18)
    const priceUSD = priceRes?.status === 'success' ? Number(formatUnits(priceRes.result as bigint, 18)) : 0

    prices.push({ address: addr, symbol, decimals, priceUSD })
  }

  // Aave oracle fallback for tokens still at 0
  const unpriced = prices.filter((p) => p.priceUSD === 0)
  if (unpriced.length > 0) {
    const aavePrices = await fetchAaveOraclePrices(
      client,
      unpriced.map((p) => p.address),
    )
    for (const p of unpriced) {
      const aavePrice = aavePrices.get(p.address.toLowerCase())
      if (aavePrice && aavePrice > 0) p.priceUSD = aavePrice
    }
  }

  // VaultLens prices for tokens still at 0
  const stillUnpriced = prices.filter((p) => p.priceUSD === 0)
  if (stillUnpriced.length > 0) {
    const vaultPrices = await fetchVaultLensPrices(client)
    for (const p of stillUnpriced) {
      const vp = vaultPrices.get(p.address.toLowerCase())
      if (vp && vp > 0) p.priceUSD = vp
    }
  }

  // Isolated pair cross-pricing for remaining tokens at 0
  const remaining = prices.filter((p) => p.priceUSD === 0)
  if (remaining.length > 0) {
    const knownPrices = new Map<string, number>()
    for (const p of prices) {
      if (p.priceUSD > 0) knownPrices.set(p.address.toLowerCase(), p.priceUSD)
    }
    const crossPrices = await fetchIsolatedCrossPrices(client, knownPrices)
    for (const p of remaining) {
      const cp = crossPrices.get(p.address.toLowerCase())
      if (cp && cp > 0) p.priceUSD = cp
    }
  }

  return prices
}

export async function fetchKnownTokenPrices(client: PublicClient): Promise<TokenPrice[]> {
  const addresses = Object.keys(KNOWN_TOKENS) as Address[]
  return fetchTokenPrices(client, addresses)
}

// ── Additional price sources ─────────────────────────────────────

/**
 * Fetch prices from Mewler vaultLens (liabilityPriceInfo.amountOutMid).
 * Returns a map of lowercase asset address -> priceUSD.
 */
export async function fetchVaultLensPrices(client: PublicClient): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>()
  try {
    const vaultAddresses = await discoverMewlerLendVaults(client)
    if (vaultAddresses.length === 0) return priceMap

    const lensCalls = vaultAddresses.map((addr) => ({
      address: LENS_ADDRESSES.vaultLens,
      abi: vaultLensAbi,
      functionName: 'getVaultInfoFull' as const,
      args: [addr] as const,
    }))

    const results = await client.multicall({ contracts: lensCalls, allowFailure: true })

    for (const res of results) {
      if (res.status !== 'success') continue
      const v = res.result as VaultLensInfo
      if (v.liabilityPriceInfo && !v.liabilityPriceInfo.queryFailure && v.liabilityPriceInfo.amountOutMid > 0n) {
        const key = v.asset.toLowerCase()
        if (!priceMap.has(key)) {
          priceMap.set(key, Number(formatUnits(v.liabilityPriceInfo.amountOutMid, PRICE_DECIMALS)))
        }
      }
    }
  } catch {
    /* vaultLens unavailable */
  }
  return priceMap
}

/**
 * Derive prices for isolated pair tokens via exchange rate cross-pricing.
 * For each pair: if we know the asset price, derive the collateral price (and vice versa).
 */
async function fetchIsolatedCrossPrices(
  client: PublicClient,
  knownPrices: Map<string, number>,
): Promise<Map<string, number>> {
  const derived = new Map<string, number>()
  try {
    const pairAddresses = (await client.readContract({
      address: ISOLATED_REGISTRY_ADDRESS,
      abi: isolatedRegistryAbi,
      functionName: 'getAllPairAddresses',
    })) as Address[]

    if (pairAddresses.length === 0) return derived

    const calls = pairAddresses.flatMap((addr) => [
      { address: addr, abi: isolatedPairAbi, functionName: 'asset' as const },
      { address: addr, abi: isolatedPairAbi, functionName: 'collateralContract' as const },
      { address: addr, abi: isolatedPairAbi, functionName: 'exchangeRateInfo' as const },
      { address: addr, abi: isolatedPairAbi, functionName: 'getConstants' as const },
    ])

    const results = await client.multicall({ contracts: calls, allowFailure: true })

    const oracleCalls: { address: Address; abi: typeof fraxOracleAbi; functionName: 'getPrices' }[] = []
    const pairInfos: {
      asset: Address
      collateral: Address
      lowExchangeRate: bigint
      exchangePrecision: bigint
    }[] = []

    for (let i = 0; i < pairAddresses.length; i++) {
      const base = i * 4
      const assetRes = results[base]
      const collRes = results[base + 1]
      const exchRes = results[base + 2]
      const constRes = results[base + 3]

      if (assetRes?.status !== 'success' || collRes?.status !== 'success') continue

      const asset = assetRes.result as Address
      const collateral = collRes.result as Address

      let oracleAddr: Address = '0x0000000000000000000000000000000000000000' as Address
      let lowExchangeRate = 0n
      if (exchRes?.status === 'success') {
        const exchData = exchRes.result as unknown as [Address, bigint, bigint, bigint, bigint]
        oracleAddr = exchData[0]
        lowExchangeRate = exchData[3]
      }

      let exchangePrecision = 0n
      if (constRes?.status === 'success') {
        const constData = constRes.result as unknown as bigint[]
        exchangePrecision = constData[4] ?? 0n
      }

      oracleCalls.push({ address: oracleAddr, abi: fraxOracleAbi, functionName: 'getPrices' as const })
      pairInfos.push({ asset, collateral, lowExchangeRate, exchangePrecision })
    }

    const oracleResults = await client.multicall({ contracts: oracleCalls, allowFailure: true })

    // Collect metadata for decimals
    const allAddrs = new Set<string>()
    for (const p of pairInfos) {
      allAddrs.add(p.asset.toLowerCase())
      allAddrs.add(p.collateral.toLowerCase())
    }

    const decCalls = [...allAddrs].map((a) => ({
      address: a as Address,
      abi: viemErc20Abi,
      functionName: 'decimals' as const,
    }))
    const decResults = await client.multicall({ contracts: decCalls, allowFailure: true })
    const decMap = new Map<string, number>()
    const addrArr = [...allAddrs]
    for (let i = 0; i < addrArr.length; i++) {
      decMap.set(
        addrArr[i]!,
        decResults[i]?.status === 'success' ? (decResults[i]!.result as number) : DEFAULT_DECIMALS,
      )
    }

    for (let i = 0; i < pairInfos.length; i++) {
      const p = pairInfos[i]!
      if (p.exchangePrecision <= 0n) continue

      const assetDec = decMap.get(p.asset.toLowerCase()) ?? DEFAULT_DECIMALS
      const collDec = decMap.get(p.collateral.toLowerCase()) ?? DEFAULT_DECIMALS

      let rawPrice = p.lowExchangeRate
      if (oracleResults[i]?.status === 'success') {
        const prices = oracleResults[i]!.result as [boolean, bigint, bigint]
        if (!prices[0]) rawPrice = prices[1]
      }

      const exchRate = (Number(rawPrice) / Number(p.exchangePrecision)) * 10 ** (assetDec - collDec)
      if (exchRate <= 0) continue

      const assetKey = p.asset.toLowerCase()
      const collKey = p.collateral.toLowerCase()
      const assetPrice = knownPrices.get(assetKey) ?? derived.get(assetKey) ?? 0
      const collPrice = knownPrices.get(collKey) ?? derived.get(collKey) ?? 0

      if (collPrice === 0 && assetPrice > 0) {
        derived.set(collKey, assetPrice / exchRate)
      } else if (assetPrice === 0 && collPrice > 0) {
        derived.set(assetKey, collPrice * exchRate)
      }
    }
  } catch {
    /* isolated cross-pricing unavailable */
  }
  return derived
}

export async function fetchAaveOraclePrices(client: PublicClient, addresses: Address[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  try {
    const oracleAddr = (await client.readContract({
      address: POOL_ADDRESS_PROVIDER,
      abi: addressProviderAbi,
      functionName: 'getPriceOracle',
    })) as Address

    const results = await client.multicall({
      contracts: addresses.map((addr) => ({
        address: oracleAddr,
        abi: aaveOracleAbi,
        functionName: 'getAssetPrice' as const,
        args: [addr] as const,
      })),
      allowFailure: true,
    })

    for (let i = 0; i < addresses.length; i++) {
      if (results[i]?.status !== 'success') continue
      const raw = results[i]!.result as bigint
      if (raw > 0n) prices.set(addresses[i]!.toLowerCase(), Number(formatUnits(raw, AAVE_ORACLE_DECIMALS)))
    }
  } catch {
    // Aave oracle unavailable
  }
  return prices
}
