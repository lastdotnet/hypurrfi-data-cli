import { type Address, type PublicClient, formatUnits } from 'viem'
import { fetchIsolatedMarkets } from '../fetchers/isolated.js'
import { fetchMewlerEarnVaults } from '../fetchers/mewler-earn.js'
import { fetchMewlerLendMarkets } from '../fetchers/mewler-lend.js'
import { fetchPooledMarkets } from '../fetchers/pooled.js'
import { fetchAaveOraclePrices, fetchAssetPrices } from '../fetchers/prices.js'
import { type OutputFormat, error, print, printCSV, success } from '../output.js'
import type { IsolatedMarket, Market, MarketType, MewlerLendMarket } from '../types.js'

const VALID_MARKET_TYPES: ReadonlySet<string> = new Set<MarketType>([
  'pooled',
  'mewler-prime',
  'mewler-yield',
  'mewler-earn',
  'isolated',
])

function getSupplyAPY(m: Market): number {
  return m.supplyAPY
}

function getBorrowAPY(m: Market): number | null {
  if (m.type === 'mewler-earn') return null
  return m.borrowAPY
}

function getTVL(m: Market): number {
  if (m.type === 'isolated') {
    return m.totalAssetsUSD + (m as IsolatedMarket).totalCollateralUSD
  }
  return m.totalAssetsUSD
}

interface MarketsOptions {
  type?: string
  asset?: string
  minTvl?: string
  sort?: string
  limit?: string
}

export async function marketsCommand(client: PublicClient, opts: MarketsOptions, format: OutputFormat = 'json'): Promise<void> {
  if (opts.type && !VALID_MARKET_TYPES.has(opts.type)) {
    print(error(`Invalid market type "${opts.type}". Valid types: pooled, mewler-prime, mewler-yield, mewler-earn, isolated.`))
    process.exit(1)
  }
  const typeFilter = opts.type as MarketType | undefined
  const assetFilter = opts.asset?.toUpperCase()
  const minTvl = Number(opts.minTvl ?? 0)
  const sortBy = opts.sort ?? 'tvl'
  const limit = opts.limit ? Number(opts.limit) : undefined

  const { markets: fetched, warnings } = await fetchAllMarkets(client, typeFilter)
  await resolveMarketPrices(client, fetched)
  computeMarketUSDValues(fetched)

  const results = applyFiltersAndSort(fetched, { assetFilter, minTvl, sortBy, limit })

  if (format === 'csv') {
    printCSV(results.map(flattenMarket))
    return
  }

  const nonEarnMarkets = results.filter((m) => m.type !== 'mewler-earn')
  const totalSuppliedUSD = nonEarnMarkets.reduce((sum, m) => sum + getTVL(m), 0)
  const totalBorrowedUSD = nonEarnMarkets.reduce((sum, m) => sum + m.totalBorrowsUSD, 0)
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
    apyBasis: {
      pooled: '365d',
      'mewler-prime': '365.25d',
      'mewler-yield': '365.25d',
      'mewler-earn': '365.25d',
      isolated: '365.2425d',
    },
    markets: results,
  }

  print(success(summary, warnings))
}

// ── Market fetching ────────────────────────────────────────────────

interface FetchResult {
  markets: Market[]
  warnings: string[]
}

async function fetchAllMarkets(client: PublicClient, typeFilter?: MarketType): Promise<FetchResult> {
  const needPooled = !typeFilter || typeFilter === 'pooled'
  const needMewlerLend = !typeFilter || typeFilter === 'mewler-prime' || typeFilter === 'mewler-yield'
  const needMewlerEarn = !typeFilter || typeFilter === 'mewler-earn'
  const needIsolated = !typeFilter || typeFilter === 'isolated'

  const [pooledResult, lendResult, isolatedResult] = await Promise.allSettled([
    needPooled ? fetchPooledMarkets(client) : Promise.resolve([]),
    needMewlerLend || needMewlerEarn ? fetchMewlerLendMarkets(client) : Promise.resolve([]),
    needIsolated ? fetchIsolatedMarkets(client) : Promise.resolve([]),
  ])

  const markets: Market[] = []
  const warnings: string[] = []

  if (pooledResult.status === 'fulfilled') {
    markets.push(...pooledResult.value)
  } else {
    warnings.push('Pooled markets unavailable: fetch failed')
  }

  let lendMarkets: MewlerLendMarket[] = []
  if (lendResult.status === 'fulfilled') {
    lendMarkets = lendResult.value
  } else {
    warnings.push('Mewler lend markets unavailable: fetch failed')
  }
  if (needMewlerLend) {
    markets.push(...(typeFilter ? lendMarkets.filter((m) => m.type === typeFilter) : lendMarkets))
  }

  if (needMewlerEarn && lendMarkets.length > 0) {
    try {
      markets.push(...(await fetchMewlerEarnVaults(client, lendMarkets)))
    } catch {
      warnings.push('Mewler earn vaults unavailable: fetch failed')
    }
  }

  if (isolatedResult.status === 'fulfilled') {
    markets.push(...isolatedResult.value)
  } else {
    warnings.push('Isolated markets unavailable: fetch failed')
  }

  return { markets, warnings }
}

// ── Pre-compute USD values ─────────────────────────────────────────

function computeMarketUSDValues(markets: Market[]): void {
  for (const m of markets) {
    m.totalAssetsUSD = Number(formatUnits(BigInt(m.totalAssets), m.assetDecimals)) * m.priceUSD
    m.totalBorrowsUSD = Number(formatUnits(BigInt(m.totalBorrows), m.assetDecimals)) * m.priceUSD
    if (m.type === 'isolated') {
      const iso = m as IsolatedMarket
      iso.totalCollateralUSD =
        Number(formatUnits(BigInt(iso.totalCollateral), iso.collateralDecimals)) * iso.collateralPriceUSD
    }
  }
}

// ── Price resolution pipeline ──────────────────────────────────────

async function resolveMarketPrices(client: PublicClient, markets: Market[]): Promise<void> {
  const priceMap = collectExistingPrices(markets)
  applyPrices(markets, priceMap)

  // Stage 1: VaultLens + Aave oracle for remaining unpriced
  const unpriced = collectUnpricedTokens(markets)
  if (unpriced.size > 0) {
    const fetched = await fetchAssetPrices(client, [...unpriced.values()])
    applyPrices(markets, fetched)
  }

  // Stage 2: Aave oracle fallback for still-unpriced tokens
  const stillUnpriced = collectUnpricedTokenAddresses(markets)
  if (stillUnpriced.size > 0) {
    const aavePrices = await fetchAaveOraclePrices(client, [...stillUnpriced.values()])
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

// ── CSV flattening ────────────────────────────────────────────────

function flattenMarket(m: Market): Record<string, unknown> {
  const base = {
    address: m.address,
    type: m.type,
    name: m.name,
    assetSymbol: m.assetSymbol,
    assetAddress: m.assetAddress,
    priceUSD: m.priceUSD,
    market: m.market,
    supplyAPY: m.supplyAPY,
    borrowAPY: 'borrowAPY' in m ? m.borrowAPY : null,
    utilization: 'utilization' in m ? m.utilization : null,
    totalAssetsUSD: m.totalAssetsUSD,
    totalBorrowsUSD: m.totalBorrowsUSD,
    supplyCap: 'supplyCap' in m ? m.supplyCap : null,
    borrowCap: 'borrowCap' in m ? m.borrowCap : null,
    maxLTV: 'maxLTV' in m ? m.maxLTV : null,
  }

  if (m.type === 'isolated') {
    return {
      ...base,
      collateralSymbol: m.collateralSymbol,
      collateralAddress: m.collateralAddress,
      collateralPriceUSD: m.collateralPriceUSD,
      totalCollateralUSD: m.totalCollateralUSD,
      exchangeRate: m.exchangeRate,
    }
  }

  return base
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
