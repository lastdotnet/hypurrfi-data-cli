import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { fetchMarketsData } from '../commands/markets.js'
import { fetchPricesData } from '../commands/prices.js'
import { fetchStrategiesData } from '../commands/strategies.js'
import { fetchUserPositionData } from '../commands/user-positions.js'
import { createClient } from '../config/chain.js'
import { success } from '../output.js'
import type { Market } from '../types.js'
import { borrowAgainstPosition, cheapestBorrow, leverageLoop } from './prompts/borrowing.js'
import { compareProtocols } from './prompts/comparison.js'
import { healthCheck, liquidationPrice, stressTest } from './prompts/risk.js'
import { findEarnStrategies, maximizeYield, optimizePortfolioYield } from './prompts/yield.js'

const server = new McpServer(
  { name: 'hypurrfi-data', version: '0.3.0' },
  {
    instructions: [
      'HyperEVM lending market data. All APY and utilization values are pre-formatted as strings with a % suffix (e.g. "7.19%").',
      'These are already percentages — do NOT multiply by 100 or reinterpret them as ratios.',
      'USD values are numbers (e.g. totalAssetsUSD: 1995000 means $1,995,000).',
      'Prices are in USD (e.g. priceUSD: 38.08 means $38.08).',
      'LTV values are formatted the same way (e.g. maxLTV: "65.00%").',
    ].join(' '),
  },
)

const DEFAULT_MARKET_LIMIT = '20'

function getClient() {
  return createClient()
}

/** Format a percentage number as a human-readable string (e.g. 0.96 → "0.96%"). */
function fmtPct(v: number): string {
  return `${v.toFixed(2)}%`
}

/** Keys that contain percentage values and should be formatted with % suffix. */
const PCT_KEYS = new Set([
  'apy', 'supplyAPY', 'borrowAPY', 'supplyAPYPct', 'borrowAPYPct',
  'utilization', 'utilizationPct', 'allocationShare',
  'currentAPY', 'bestAPY', 'deltaAPY', 'netAPY', 'cheapestAPY', 'bestNetAPY',
  'bestSupplyAPY', 'bestBorrowAPY', 'totalDeltaAPY',
  'maxLTV', 'liquidationLTV', 'liquidationThreshold', 'ltv', 'targetLTV',
])

/** Recursively format all percentage fields in prompt/tool output as "X.XX%" strings. */
function formatPctFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(formatPctFields)
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (PCT_KEYS.has(k) && typeof v === 'number') {
        result[k] = fmtPct(v)
      } else {
        result[k] = formatPctFields(v)
      }
    }
    return result
  }
  return obj
}

/** Strip verbose nested arrays from market objects for compact MCP responses. */
function compactMarket(m: Market) {
  const base = {
    address: m.address,
    type: m.type,
    name: m.name,
    assetSymbol: m.assetSymbol,
    assetAddress: m.assetAddress,
    priceUSD: m.priceUSD,
    supplyAPY: fmtPct(m.supplyAPY),
    totalAssetsUSD: m.totalAssetsUSD,
    totalBorrowsUSD: m.totalBorrowsUSD,
  }
  if (m.type === 'mewler-earn') {
    return {
      ...base,
      performanceFee: m.performanceFee,
      curator: m.curator,
      strategies: m.strategies.map((s) => ({
        address: s.address,
        name: s.name,
        allocationPct: fmtPct(s.allocationShare * 100),
        supplyAPY: fmtPct(s.supplyAPY),
        utilization: fmtPct(s.utilization),
        isEscrow: s.isEscrow,
      })),
    }
  }
  const mewlerLTV = (m.type === 'mewler-prime' || m.type === 'mewler-yield')
    ? {
        collateralIn: m.collateralIn.map((v) => ({
          vault: v.vaultName,
          vaultType: v.vaultType,
          maxLTV: fmtPct(v.maxLTV),
          liquidationLTV: fmtPct(v.liquidationThreshold),
        })),
        borrowableBy: m.borrowableBy.map((v) => ({
          vault: v.vaultName,
          vaultType: v.vaultType,
          maxLTV: fmtPct(v.maxLTV),
          liquidationLTV: fmtPct(v.liquidationThreshold),
        })),
      }
    : {}
  return {
    ...base,
    borrowAPY: fmtPct(m.borrowAPY),
    utilization: fmtPct(m.utilization),
    maxLTV: 'maxLTV' in m ? fmtPct(m.maxLTV) : null,
    ...mewlerLTV,
    ...(m.type === 'isolated'
      ? { collateralSymbol: m.collateralSymbol, collateralPriceUSD: m.collateralPriceUSD, totalCollateralUSD: m.totalCollateralUSD }
      : {}),
  }
}

// ── Tools ────────────────────────────────────────────────────────────

server.tool(
  'get_markets',
  'List HyperEVM lending markets with filtering and sorting. Returns compact summaries — use resources for full detail on a single market.',
  {
    type: z.string().optional().describe('Market type: pooled, mewler-prime, mewler-yield, mewler-earn, isolated'),
    asset: z.string().optional().describe('Filter by asset symbol (e.g. USDC, WHYPE)'),
    minTvl: z.string().optional().describe('Minimum TVL in USD').transform((v) => {
      if (v === undefined) return v
      const n = Number(v)
      if (Number.isNaN(n)) throw new Error(`minTvl must be a number, got "${v}"`)
      return String(n)
    }),
    sort: z.enum(['tvl', 'supply-apy', 'borrow-apy']).optional().describe('Sort by: tvl (default), supply-apy, borrow-apy'),
    limit: z.string().optional().describe('Max results to return (default 20)').transform((v) => {
      if (v === undefined) return v
      const n = Number(v)
      if (Number.isNaN(n) || n < 1) throw new Error(`limit must be a positive number, got "${v}"`)
      return String(Math.floor(n))
    }),
  },
  async (params) => {
    try {
      const { summary, warnings } = await fetchMarketsData(getClient(), {
        type: params['type'] ?? undefined,
        asset: params['asset'] ?? undefined,
        minTvl: params['minTvl'] ?? undefined,
        sort: params['sort'] ?? undefined,
        limit: params['limit'] ?? DEFAULT_MARKET_LIMIT,
      })
      const compact = {
        totalMarkets: summary.totalMarkets,
        totalsUSD: summary.totalsUSD,
        filters: summary.filters,
        byType: summary.byType,
        markets: summary.markets.map(compactMarket),
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(success(compact, warnings)) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: String(e) }], isError: true }
    }
  },
)

server.tool(
  'get_user_positions',
  'Get user portfolio across all HyperEVM lending protocols',
  { address: z.string().describe('User wallet address (0x...)') },
  async (params) => {
    try {
      const data = await fetchUserPositionData(getClient(), params['address'])
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatPctFields(success(data))) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: String(e) }], isError: true }
    }
  },
)

server.tool(
  'get_prices',
  'Get token prices from HyperEVM oracles',
  { tokens: z.string().optional().describe('Comma-separated token addresses (defaults to all known tokens)') },
  async (params) => {
    try {
      const tokens = params['tokens'] ?? undefined
      const data = await fetchPricesData(getClient(), { tokens })
      return { content: [{ type: 'text' as const, text: JSON.stringify(success(data)) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: String(e) }], isError: true }
    }
  },
)

server.tool(
  'get_strategies',
  'List earn vault strategies with allocations, APYs, and target vaults',
  {
    asset: z.string().optional().describe('Filter by vault asset (e.g. USDC, WHYPE)'),
    vault: z.string().optional().describe('Filter by vault address'),
  },
  async (params) => {
    try {
      const data = await fetchStrategiesData(getClient(), {
        asset: params['asset'] ?? undefined,
        vault: params['vault'] ?? undefined,
      })
      const compact = {
        vaultCount: data.vaultCount,
        strategyCount: data.strategyCount,
        strategies: data.strategies.map((s) => ({
          vaultName: s.vaultName,
          vaultAsset: s.vaultAsset,
          vaultAPY: fmtPct(s.vaultAPY),
          strategyAddress: s.strategyAddress,
          strategyName: s.strategyName,
          allocationPct: fmtPct(s.allocationShare * 100),
          supplyAPY: fmtPct(s.supplyAPY),
          utilization: fmtPct(s.utilization),
          isEscrow: s.isEscrow,
        })),
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(success(compact)) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: String(e) }], isError: true }
    }
  },
)

// ── Resource Templates ───────────────────────────────────────────────

server.resource('all-strategies', 'hypurr://strategies', async (uri) => {
  const data = await fetchStrategiesData(getClient(), {})
  return { contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(data) }] }
})

server.resource(
  'strategies-by-asset',
  new ResourceTemplate('hypurr://strategies/{asset}', { list: undefined }),
  async (uri, variables) => {
    const asset = String(variables['asset'] ?? '')
    const data = await fetchStrategiesData(getClient(), { asset: asset || undefined })
    return { contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(data) }] }
  },
)

server.resource('all-markets', 'hypurr://markets', async (uri) => {
  const { summary } = await fetchMarketsData(getClient(), {})
  const compact = { totalMarkets: summary.totalMarkets, totalsUSD: summary.totalsUSD, byType: summary.byType, markets: summary.markets.map(compactMarket) }
  return { contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(compact) }] }
})

server.resource(
  'markets-by-type',
  new ResourceTemplate('hypurr://markets/{type}', { list: undefined }),
  async (uri, variables) => {
    const type = String(variables['type'] ?? '')
    const { summary } = await fetchMarketsData(getClient(), { type: type || undefined })
    const compact = { totalMarkets: summary.totalMarkets, totalsUSD: summary.totalsUSD, markets: summary.markets.map(compactMarket) }
    return { contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(compact) }] }
  },
)

server.resource(
  'market-by-address',
  new ResourceTemplate('hypurr://market/{address}', { list: undefined }),
  async (uri, variables) => {
    const address = String(variables['address'] ?? '')
    const { summary } = await fetchMarketsData(getClient(), {})
    const market = summary.markets.find((m) => m.address.toLowerCase() === address.toLowerCase())
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(market ?? null) }],
    }
  },
)

server.resource(
  'positions-by-address',
  new ResourceTemplate('hypurr://positions/{address}', { list: undefined }),
  async (uri, variables) => {
    const address = String(variables['address'] ?? '')
    const data = await fetchUserPositionData(getClient(), address)
    return { contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(data) }] }
  },
)

server.resource('all-prices', 'hypurr://prices', async (uri) => {
  const data = await fetchPricesData(getClient(), {})
  return { contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(data) }] }
})

server.resource(
  'price-by-symbol',
  new ResourceTemplate('hypurr://price/{symbol}', { list: undefined }),
  async (uri, variables) => {
    const symbol = String(variables['symbol'] ?? '')
    const data = await fetchPricesData(getClient(), {})
    const price = data.prices.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase())
    return { contents: [{ uri: uri.href, mimeType: 'application/json' as const, text: JSON.stringify(price ?? null) }] }
  },
)

// ── Prompts ──────────────────────────────────────────────────────────

server.prompt(
  'maximize_yield',
  'Find highest risk-adjusted yield for a token across all protocols',
  { token: z.string().describe('Token symbol (e.g. USDC, WHYPE)') },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await maximizeYield(getClient(), params['token']))) },
    }],
  }),
)

server.prompt(
  'optimize_portfolio_yield',
  'Analyze portfolio and suggest yield optimization moves',
  { address: z.string().describe('User wallet address (0x...)') },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await optimizePortfolioYield(getClient(), params['address']))) },
    }],
  }),
)

server.prompt(
  'find_earn_strategies',
  'Show best curated earn vault strategies for a token',
  { token: z.string().describe('Token symbol (e.g. USDC)') },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await findEarnStrategies(getClient(), params['token']))) },
    }],
  }),
)

server.prompt(
  'borrow_against_position',
  'Calculate borrow capacity and recommend cheapest rates',
  {
    address: z.string().describe('User wallet address (0x...)'),
    borrowToken: z.string().describe('Token to borrow'),
    collateralToken: z.string().describe('Collateral token'),
    targetLTV: z.string().describe('Target LTV ratio (e.g. 0.5 for 50%)').transform((v) => {
      const n = Number(v)
      if (Number.isNaN(n) || n <= 0 || n >= 1) throw new Error(`targetLTV must be between 0 and 1, got "${v}"`)
      return v
    }),
  },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: JSON.stringify(
          await borrowAgainstPosition(getClient(), params['address'], params['borrowToken'], params['collateralToken'], Number(params['targetLTV'])),
        ),
      },
    }],
  }),
)

server.prompt(
  'cheapest_borrow',
  'Compare borrow APYs across all protocols for a token',
  { token: z.string().describe('Token symbol to borrow') },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await cheapestBorrow(getClient(), params['token']))) },
    }],
  }),
)

server.prompt(
  'leverage_loop',
  'Calculate net APY of looping a token at given leverage',
  {
    token: z.string().describe('Token symbol'),
    leverage: z.string().describe('Leverage multiplier (e.g. 2, 3)').transform((v) => {
      const n = Number(v)
      if (Number.isNaN(n) || n < 1) throw new Error(`leverage must be >= 1, got "${v}"`)
      return v
    }),
  },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await leverageLoop(getClient(), params['token'], Number(params['leverage'])))) },
    }],
  }),
)

server.prompt(
  'health_check',
  'Assess liquidation risk across all positions',
  { address: z.string().describe('User wallet address (0x...)') },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await healthCheck(getClient(), params['address']))) },
    }],
  }),
)

server.prompt(
  'liquidation_price',
  'Calculate price level that triggers liquidation per position',
  {
    address: z.string().describe('User wallet address (0x...)'),
    token: z.string().optional().describe('Optional token filter'),
  },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await liquidationPrice(getClient(), params['address'], params['token'] ?? undefined))) },
    }],
  }),
)

server.prompt(
  'stress_test',
  'Simulate price drop impact on health factors',
  {
    address: z.string().describe('User wallet address (0x...)'),
    token: z.string().describe('Token to simulate price drop for'),
    dropPercent: z.string().describe('Price drop percentage (e.g. 20 for 20%)').transform((v) => {
      const n = Number(v)
      if (Number.isNaN(n) || n <= 0 || n >= 100) throw new Error(`dropPercent must be between 0 and 100, got "${v}"`)
      return v
    }),
  },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: JSON.stringify(formatPctFields(await stressTest(getClient(), params['address'], params['token'], Number(params['dropPercent'])))),
      },
    }],
  }),
)

server.prompt(
  'compare_protocols',
  'Side-by-side comparison of rates across protocols for a token',
  { token: z.string().describe('Token symbol') },
  async (params) => ({
    messages: [{
      role: 'user' as const,
      content: { type: 'text' as const, text: JSON.stringify(formatPctFields(await compareProtocols(getClient(), params['token']))) },
    }],
  }),
)

// ── Start ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP server error:', err)
  process.exit(1)
})
