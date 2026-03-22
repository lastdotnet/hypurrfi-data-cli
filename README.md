# @hypurrfi/data-cli

HypurrFi lending protocol data API CLI for agents (OpenClaw, etc.) — real-time yields, borrows, positions, and prices on HyperEVM.

All data is fetched directly on-chain via RPC multicall reads. No external indexer dependencies.

## Quick Start

```bash
pnpm install
pnpm build
node dist/index.mjs markets --sort supply-apy --limit 5
```

## RPC & Default Address Configuration

By default the CLI uses the public HyperEVM RPC (`https://rpc.hyperliquid.xyz/evm`). For better reliability, provide your own RPC:

```bash
# Via .env file (auto-loaded)
echo "HYPEREVM_RPC_URL=https://your-rpc-url" > .env

# Via environment variable
export HYPEREVM_RPC_URL=https://your-rpc-url

# Via CLI flag (overrides everything)
node dist/index.mjs --rpc https://your-rpc-url markets
```

Priority: `--rpc` flag > `HYPEREVM_RPC_URL` env var / `.env` > public RPC.

You can also set a default wallet address for `user-positions`:

```bash
# Via .env
echo "HYPURR_USER_ADDRESS=0xYourWalletAddress" >> .env

# Via environment variable
export HYPURR_USER_ADDRESS=0xYourWalletAddress

# Via CLI global flag (overrides env)
node dist/index.mjs --address 0xYourWalletAddress user-positions
```

Address priority for `user-positions`: positional `<address>` > `--address` > `HYPURR_USER_ADDRESS`.

## Commands

| Command | Description |
|---------|-------------|
| `markets` | List, filter, and sort lending markets across all protocols |
| `strategies` | List earn vault strategies with allocations and APYs |
| `user-positions [address]` | Get user positions across all protocols (`address` optional if default is configured) |
| `prices` | Fetch token prices from Mewler oracle |

Use `--help` on any command for full options.

### Examples

```bash
# All markets sorted by TVL
node dist/index.mjs markets

# Top 10 supply yields
node dist/index.mjs markets -s supply-apy -n 10

# Cheapest USDC borrows
node dist/index.mjs markets -s borrow-apy -a USDC

# Mewler Prime markets with >$10k TVL
node dist/index.mjs markets -t mewler-prime --min-tvl 10000

# User positions
node dist/index.mjs user-positions 0x1234...abcd

# User positions with default configured address
node dist/index.mjs user-positions

# Token prices
node dist/index.mjs prices
```

## Market Types

| Type | Protocol | Description |
|------|----------|-------------|
| `pooled` | Pooled | Pooled lending — supply/borrow any listed asset, shared liquidity |
| `mewler-prime` | Mewler | Conservative vaults with blue-chip collateral |
| `mewler-yield` | Mewler | Yield-optimized lending vaults |
| `mewler-earn` | Mewler | Curated ERC-4626 earn vaults with underlying strategies |
| `isolated` | Isolated | Isolated lending pairs — single collateral per borrow asset |

### Key Market Fields

- Common: `totalAssets`, `totalBorrows` are raw smallest-unit strings.
- Pooled + Mewler lend (`mewler-prime`, `mewler-yield`) + Isolated also include:
  - `supplyCap` — raw on-chain cap value (smallest-unit string; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped)
  - `borrowCap` — raw on-chain cap value (smallest-unit string; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped)

## Library Usage (Programmatic)

You can import the fetchers directly as a library instead of running the CLI:

```typescript
import {
  createClient,
  fetchPooledMarkets,
  fetchKnownTokenPrices,
  fetchUserPositions,
} from '@hypurrfi/data-cli/lib'
import type { PooledMarket, TokenPrice } from '@hypurrfi/data-cli/lib'

const client = createClient() // uses HYPEREVM_RPC_URL env or public RPC
const markets = await fetchPooledMarkets(client)
const prices = await fetchKnownTokenPrices(client)
const positions = await fetchUserPositions(client, '0x1234...abcd')
```

All fetcher functions accept a viem `PublicClient` as the first argument, so you can create one client and reuse it across calls.

### Available Exports

| Export | Description |
|--------|-------------|
| `createClient(rpcUrl?)` | Create a viem PublicClient for HyperEVM |
| `fetchPooledMarkets(client)` | Pooled (Aave) lending markets |
| `fetchMewlerLendMarkets(client)` | Mewler Prime & Yield lending vaults |
| `fetchMewlerEarnVaults(client)` | Mewler Earn curated vaults |
| `fetchIsolatedMarkets(client)` | Isolated lending pairs |
| `fetchKnownTokenPrices(client)` | Prices for all known tokens |
| `fetchTokenPrices(client, addresses)` | Prices for specific token addresses |
| `fetchUserPositions(client, address)` | Cross-protocol user positions |
| `fetchPooledUserPosition(client, address)` | Pooled-only user position |
| `fetchIsolatedUserPositions(client, address)` | Isolated-only user positions |

All types (`PooledMarket`, `MewlerLendMarket`, `TokenPrice`, `UserPositionSummary`, etc.) are also exported.

## MCP Server

The package includes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes HyperEVM lending data to AI agents like Claude. All data is fetched on-chain in real time.

### Setup

**Homebrew:**

```bash
brew tap lastdotnet/last-taproom
brew install hypurrfi-data-cli
```

**Claude Code:**

```bash
claude mcp add hypurrfi hypurr-data-mcp
```

**Claude Desktop** — add to your config:

```json
{
  "mcpServers": {
    "hypurrfi": {
      "command": "hypurr-data-mcp"
    }
  }
}
```

**Development:**

```bash
pnpm dev:mcp
```

### Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_markets` | List lending markets with filtering and sorting | `type?`, `asset?`, `minTvl?`, `sort?`, `limit?` |
| `get_user_positions` | Get user portfolio across all protocols | `address` |
| `get_prices` | Get token prices from HyperEVM oracles | `tokens?` |
| `get_strategies` | List earn vault strategies with allocations and APYs | `asset?`, `vault?` |

**`get_markets` parameters:**
- `type` — Filter by market type: `pooled`, `mewler-prime`, `mewler-yield`, `mewler-earn`, `isolated`
- `asset` — Filter by asset symbol (e.g. `USDC`, `WHYPE`). Fuzzy-matches Unicode variants (e.g. `USD₮0`)
- `minTvl` — Minimum TVL in USD (e.g. `10000`)
- `sort` — Sort by: `tvl` (default), `supply-apy`, `borrow-apy`
- `limit` — Max results (default 20)

### Resources

Static and parameterized data endpoints that MCP clients can browse:

| Resource | URI | Description |
|----------|-----|-------------|
| All markets | `hypurr://markets` | All markets with compact summaries |
| Markets by type | `hypurr://markets/{type}` | Markets filtered by type |
| Market by address | `hypurr://market/{address}` | Full detail for a single market |
| All strategies | `hypurr://strategies` | All earn vault strategies |
| Strategies by asset | `hypurr://strategies/{asset}` | Strategies filtered by asset |
| Positions by address | `hypurr://positions/{address}` | User positions across all protocols |
| All prices | `hypurr://prices` | All token prices |
| Price by symbol | `hypurr://price/{symbol}` | Price for a single token |

### Prompts

Prompts are compound, intent-based queries that fetch data from multiple sources and return structured recommendations. They are designed to be used as conversation starters with an AI agent.

#### Yield Optimization

| Prompt | Description | Parameters |
|--------|-------------|------------|
| `maximize_yield` | Find the highest risk-adjusted yield for a token across all protocols | `token` |
| `optimize_portfolio_yield` | Analyze a wallet's positions and suggest reallocation moves to improve yield | `address` |
| `find_earn_strategies` | Show the best curated earn vault strategies for a token | `token` |

#### Borrowing

| Prompt | Description | Parameters |
|--------|-------------|------------|
| `cheapest_borrow` | Compare borrow APYs across all protocols for a token | `token` |
| `borrow_against_position` | Calculate borrow capacity given collateral and recommend cheapest rates | `address`, `borrowToken`, `collateralToken`, `targetLTV` |
| `leverage_loop` | Calculate net APY of looping (supply + borrow same token) at given leverage | `token`, `leverage` |

#### Risk Management

| Prompt | Description | Parameters |
|--------|-------------|------------|
| `health_check` | Assess liquidation risk across all positions for a wallet | `address` |
| `liquidation_price` | Calculate the price level that triggers liquidation per position | `address`, `token?` |
| `stress_test` | Simulate a price drop and show impact on health factors | `address`, `token`, `dropPercent` |

#### Comparison

| Prompt | Description | Parameters |
|--------|-------------|------------|
| `compare_protocols` | Side-by-side comparison of supply/borrow rates across all protocols for a token | `token` |

### Example Queries

These are natural-language queries you can ask an AI agent with the MCP server connected:

**Yield:**
- "Where can I get the best yield on my USDC?"
- "I have a portfolio at 0x1234...abcd — am I leaving yield on the table?"
- "Show me earn vault strategies for WHYPE"

**Borrowing:**
- "What's the cheapest place to borrow USDC right now?"
- "I want to borrow USDC against my WHYPE collateral at 50% LTV — what are my options?"
- "What's the net APY if I loop USDC at 3x leverage?"

**Risk:**
- "Check the health of my positions at 0x1234...abcd"
- "At what price does my WHYPE collateral get liquidated?"
- "If WHYPE drops 30%, will any of my positions get liquidated?"

**Comparison:**
- "Compare USDC rates across all protocols"

**Compound intents** (multi-step queries that combine tools and prompts):
- "Find the cheapest place to borrow USDC, then show me earn strategies I could deposit it into for a positive carry"
- "Check my portfolio at 0x1234...abcd — if any positions have a health factor below 1.3, show me what price drop would liquidate them"
- "I want to loop WHYPE at 2.5x leverage — compare the net APY across protocols and flag any with utilization above 90%"
- "What's the best yield on USDC right now? Compare that to borrowing USDC and looping at 2x — which nets more?"
- "Scan my positions at 0x1234...abcd, find any tokens where I'm earning below the market best, and suggest where to move them"
- "Stress test my portfolio against a 25% WHYPE drop, then recommend borrows I should repay to stay above 1.2 health factor"

## Agent Integration (OpenClaw)

Full response schemas, field descriptions, and decision-making workflows are documented in the OpenClaw skill:

**[`skills/hypurr-data/SKILL.md`](skills/hypurr-data/SKILL.md)**

Install the skill into your OpenClaw agent's workspace to enable HypurrFi lending data queries.

## Architecture

```
src/
├── index.ts              # CLI entry (commander)
├── lib.ts                # Library entry (programmatic imports)
├── output.ts             # JSON response formatting
├── types.ts              # Shared types
├── config/
│   ├── chain.ts          # HyperEVM chain config + viem client
│   ├── contracts.ts      # Contract addresses, vault registry, market labels
│   └── abis.ts           # Minimal ABIs for on-chain reads
├── calculations/
│   └── apy.ts            # APY formulas (Pooled, Mewler, Isolated)
├── fetchers/
│   ├── pooled.ts         # Pooled reserve data
│   ├── mewler-lend.ts    # Mewler lending vaults (on-chain via perspective contracts)
│   ├── mewler-earn.ts    # Mewler Earn vaults (on-chain with strategy APY)
│   ├── isolated.ts       # Isolated pair registry + data
│   ├── prices.ts         # Mewler oracle token prices
│   └── user.ts           # Cross-protocol user positions
├── commands/
│   ├── markets.ts        # Unified market listing with filters & sorting
│   ├── strategies.ts     # Earn vault strategy listing
│   ├── user-positions.ts
│   └── prices.ts
├── mcp/
│   ├── server.ts         # MCP server entry point (stdio transport)
│   ├── utils.ts          # Shared utilities (normalizeSymbol, meta)
│   └── prompts/
│       ├── yield.ts      # maximize_yield, optimize_portfolio, find_earn_strategies
│       ├── borrowing.ts  # cheapest_borrow, borrow_against_position, leverage_loop
│       ├── risk.ts       # health_check, liquidation_price, stress_test
│       └── comparison.ts # compare_protocols
└── skills/
    └── hypurr-data/
        └── SKILL.md      # OpenClaw agent skill
```
