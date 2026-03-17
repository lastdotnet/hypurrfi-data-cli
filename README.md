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
│   ├── user-positions.ts
│   └── prices.ts
└── skills/
    └── hypurr-data/
        └── SKILL.md      # OpenClaw agent skill
```
