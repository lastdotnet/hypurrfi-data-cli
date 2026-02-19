import { type Address, type PublicClient, formatUnits } from 'viem'
import { aaveOracleAbi, addressProviderAbi } from '../config/abis.js'
import { AAVE_ORACLE_DECIMALS } from '../config/constants.js'
import { POOL_ADDRESS_PROVIDER } from '../config/contracts.js'
import { fetchIsolatedMarkets } from '../fetchers/isolated.js'
import { fetchMewlerEarnVaults } from '../fetchers/mewler-earn.js'
import { fetchMewlerLendMarkets } from '../fetchers/mewler-lend.js'
import { fetchPooledMarkets } from '../fetchers/pooled.js'
import { fetchAssetPrices } from '../fetchers/prices.js'
import { print, success } from '../output.js'
import type { IsolatedMarket, Market, MarketType } from '../types.js'

function getSupplyAPY(m: Market): number {
  return m.supplyAPY
}

function getBorrowAPY(m: Market): number | null {
  if (m.type === 'mewler-earn') return null
  return m.borrowAPY
}

function getSuppliedUSD(m: Market): number {
  const assetUSD = Number(formatUnits(BigInt(m.totalAssets), m.assetDecimals)) * m.priceUSD
  if (m.type === 'isolated') {
    const iso = m as IsolatedMarket
    const collateralUSD =
      Number(formatUnits(BigInt(iso.totalCollateral), iso.collateralDecimals)) * iso.collateralPriceUSD
    return assetUSD + collateralUSD
  }
  return assetUSD
}

function getBorrowedUSD(m: Market): number {
  return Number(formatUnits(BigInt(m.totalBorrows), m.assetDecimals)) * m.priceUSD
}

function getTVL(m: Market): number {
  return getSuppliedUSD(m)
}

interface MarketsOptions {
  type?: string
  asset?: string
  minTvl?: string
  sort?: string
  limit?: string
}

export async function marketsCommand(client: PublicClient, opts: MarketsOptions): Promise<void> {
  const typeFilter = opts.type as MarketType | undefined
  const assetFilter = opts.asset?.toUpperCase()
  const minTvl = Number(opts.minTvl ?? 0)
  const sortBy = opts.sort ?? 'tvl'
  const limit = opts.limit ? Number(opts.limit) : undefined

  let results = await fetchAllMarkets(client, typeFilter)
  await resolveMarketPrices(client, results)

  results = applyFiltersAndSort(results, { assetFilter, minTvl, sortBy, limit })

  const nonEarnMarkets = results.filter((m) => m.type !== 'mewler-earn')
  const totalSuppliedUSD = nonEarnMarkets.reduce((sum, m) => sum + getSuppliedUSD(m), 0)
  const totalBorrowedUSD = nonEarnMarkets.reduce((sum, m) => sum + getBorrowedUSD(m), 0)
  const totalAvailableUSD = totalSuppliedUSD - totalBorrowedUSD

  const summary = {
    totalMarkets: results.length,
    totalsUSD: {
      supplied: totalSuppliedUSD,
      borrowed: totalBorrowedUSD,
      available: totalAvailableUSD,
    },
    filters: {
      type: typeFilter ?? null,
      asset: assetFilter ?? null,
      minTvl,
      sort: sortBy,
      limit: limit ?? null,
    },
    byType: {
      pooled: results.filter((m) => m.type === 'pooled').length,
      'mewler-prime': results.filter((m) => m.type === 'mewler-prime').length,
      'mewler-yield': results.filter((m) => m.type === 'mewler-yield').length,
      'mewler-earn': results.filter((m) => m.type === 'mewler-earn').length,
      isolated: results.filter((m) => m.type === 'isolated').length,
    },
    markets: results,
  }

  print(success(summary))
}

// ── Market fetching ────────────────────────────────────────────────

async function fetchAllMarkets(client: PublicClient, typeFilter?: MarketType): Promise<Market[]> {
  const needPooled = !typeFilter || typeFilter === 'pooled'
  const needMewlerLend = !typeFilter || typeFilter === 'mewler-prime' || typeFilter === 'mewler-yield'
  const needMewlerEarn = !typeFilter || typeFilter === 'mewler-earn'
  const needIsolated = !typeFilter || typeFilter === 'isolated'

  const [pooledResult, lendResult, isolatedResult] = await Promise.allSettled([
    needPooled ? fetchPooledMarkets(client) : Promise.resolve([]),
    needMewlerLend || needMewlerEarn ? fetchMewlerLendMarkets(client) : Promise.resolve([]),
    needIsolated ? fetchIsolatedMarkets(client) : Promise.resolve([]),
  ])

  const results: Market[] = []

  if (pooledResult.status === 'fulfilled') {
    results.push(...pooledResult.value)
  } else {
    console.error('Fetch error (pooled):', pooledResult.reason)
  }

  const lendMarkets = lendResult.status === 'fulfilled' ? lendResult.value : []
  if (needMewlerLend) {
    results.push(...(typeFilter ? lendMarkets.filter((m) => m.type === typeFilter) : lendMarkets))
  }

  if (needMewlerEarn && lendMarkets.length > 0) {
    try {
      results.push(...(await fetchMewlerEarnVaults(client, lendMarkets)))
    } catch (err) {
      console.error('Fetch error (mewler earn):', err)
    }
  }

  if (isolatedResult.status === 'fulfilled') {
    results.push(...isolatedResult.value)
  } else {
    console.error('Fetch error (isolated):', isolatedResult.reason)
  }

  return results
}

// ── Price resolution pipeline ──────────────────────────────────────

async function resolveMarketPrices(client: PublicClient, markets: Market[]): Promise<void> {
  const priceMap = collectExistingPrices(markets)
  applyPrices(markets, priceMap)

  // Stage 1: Mewler oracle batch for remaining unpriced
  const unpriced = collectUnpricedTokens(markets)
  if (unpriced.size > 0) {
    const fetched = await fetchAssetPrices(client, [...unpriced.values()])
    applyPrices(markets, fetched)
  }

  // Stage 2: Aave oracle fallback for still-unpriced tokens
  const stillUnpriced = collectUnpricedTokenAddresses(markets)
  if (stillUnpriced.size > 0) {
    const aavePrices = await fetchAaveOracleFallback(client, [...stillUnpriced.values()])
    applyPrices(markets, aavePrices)
  }

  // Stage 3: Cross-price isolated markets using exchange rates
  crossPriceIsolatedMarkets(markets)
}

function collectExistingPrices(markets: Market[]): Map<string, number> {
  const prices = new Map<string, number>()
  for (const m of markets) {
    if (m.priceUSD > 0) prices.set(m.assetAddress.toLowerCase(), m.priceUSD)
  }
  return prices
}

function collectUnpricedTokens(markets: Market[]): Map<string, { address: Address; decimals: number }> {
  const unpriced = new Map<string, { address: Address; decimals: number }>()
  for (const m of markets) {
    if (m.priceUSD === 0) {
      unpriced.set(m.assetAddress.toLowerCase(), { address: m.assetAddress, decimals: m.assetDecimals })
    }
    if (m.type === 'isolated') {
      const iso = m as IsolatedMarket
      if (!unpriced.has(iso.collateralAddress.toLowerCase())) {
        unpriced.set(iso.collateralAddress.toLowerCase(), {
          address: iso.collateralAddress,
          decimals: iso.collateralDecimals,
        })
      }
    }
  }
  return unpriced
}

function collectUnpricedTokenAddresses(markets: Market[]): Map<string, Address> {
  const addrs = new Map<string, Address>()
  for (const m of markets) {
    if (m.priceUSD === 0) addrs.set(m.assetAddress.toLowerCase(), m.assetAddress)
    if (m.type === 'isolated') {
      const iso = m as IsolatedMarket
      if (iso.collateralPriceUSD === 0) addrs.set(iso.collateralAddress.toLowerCase(), iso.collateralAddress)
    }
  }
  return addrs
}

function applyPrices(markets: Market[], priceMap: Map<string, number>): void {
  for (const m of markets) {
    const price = priceMap.get(m.assetAddress.toLowerCase())
    if (price && price > 0 && m.priceUSD === 0) m.priceUSD = price

    if (m.type === 'isolated') {
      const iso = m as IsolatedMarket
      const collPrice = priceMap.get(iso.collateralAddress.toLowerCase())
      if (collPrice && collPrice > 0 && iso.collateralPriceUSD === 0) iso.collateralPriceUSD = collPrice
    }
  }
}

async function fetchAaveOracleFallback(client: PublicClient, addresses: Address[]): Promise<Map<string, number>> {
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
      const price = Number(formatUnits(results[i]!.result as bigint, AAVE_ORACLE_DECIMALS))
      if (price > 0) prices.set(addresses[i]!.toLowerCase(), price)
    }
  } catch {
    /* Aave oracle unavailable */
  }
  return prices
}

function crossPriceIsolatedMarkets(markets: Market[]): void {
  const allPrices = new Map<string, number>()
  for (const m of markets) {
    if (m.priceUSD > 0) allPrices.set(m.assetAddress.toLowerCase(), m.priceUSD)
  }

  for (const m of markets) {
    if (m.type !== 'isolated') continue
    const iso = m as IsolatedMarket

    if (iso.collateralPriceUSD === 0) {
      iso.collateralPriceUSD = allPrices.get(iso.collateralAddress.toLowerCase()) ?? 0
    }

    if (iso.exchangeRate > 0) {
      if (iso.priceUSD === 0 && iso.collateralPriceUSD > 0) {
        iso.priceUSD = iso.collateralPriceUSD * iso.exchangeRate
        allPrices.set(iso.assetAddress.toLowerCase(), iso.priceUSD)
      } else if (iso.collateralPriceUSD === 0 && iso.priceUSD > 0) {
        iso.collateralPriceUSD = iso.priceUSD / iso.exchangeRate
      }
    }
  }
}

// ── Filtering & sorting ────────────────────────────────────────────

interface FilterOpts {
  assetFilter?: string | undefined
  minTvl: number
  sortBy: string
  limit?: number | undefined
}

function applyFiltersAndSort(markets: Market[], opts: FilterOpts): Market[] {
  let results = markets

  if (opts.assetFilter) {
    results = results.filter((m) => m.assetSymbol.toUpperCase().includes(opts.assetFilter!))
  }
  if (opts.minTvl > 0) {
    results = results.filter((m) => getTVL(m) >= opts.minTvl)
  }

  if (opts.sortBy === 'supply-apy') {
    results.sort((a, b) => getSupplyAPY(b) - getSupplyAPY(a))
  } else if (opts.sortBy === 'borrow-apy') {
    results.sort(
      (a, b) => (getBorrowAPY(a) ?? Number.POSITIVE_INFINITY) - (getBorrowAPY(b) ?? Number.POSITIVE_INFINITY),
    )
  } else {
    results.sort((a, b) => getTVL(b) - getTVL(a))
  }

  if (opts.limit) {
    results = results.slice(0, opts.limit)
  }

  return results
}
