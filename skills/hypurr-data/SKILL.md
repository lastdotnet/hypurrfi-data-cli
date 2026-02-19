---
name: hypurr-data
description: Query HypurrFi lending protocol data on HyperEVM — markets, yields, borrows, user positions, and token prices across Pooled, Mewler (Prime/Yield/Earn), and Isolated markets.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["HYPEREVM_RPC_URL", "HYPURR_USER_ADDRESS"] }, "primaryEnv": "HYPEREVM_RPC_URL" } }
---

# HypurrFi Data API

You have access to the `hypurr-data` CLI tool that fetches real-time on-chain lending data from HyperEVM. Use it to answer questions about yields, borrow rates, user positions, and token prices.

## How to Run

```bash
node {baseDir}/../../dist/index.mjs <command> [options]
```

All commands output JSON to stdout. Parse the JSON to extract data.

## RPC Configuration

By default the tool uses the public HyperEVM RPC. For better reliability, configure a custom RPC:

**OpenClaw config** (`~/.openclaw/openclaw.json`):
```json
{ "skills": { "entries": { "hypurr-data": { "env": { "HYPEREVM_RPC_URL": "https://your-rpc-url", "HYPURR_USER_ADDRESS": "0xYourWalletAddress" } } } } }
```

**Standalone** (`.env` file in the tool directory):
```
HYPEREVM_RPC_URL=https://your-rpc-url
HYPURR_USER_ADDRESS=0xYourWalletAddress
```

**CLI flag** (overrides everything):
```bash
node {baseDir}/../../dist/index.mjs --rpc https://your-rpc-url markets
```

Priority: `--rpc` flag > `HYPEREVM_RPC_URL` env var > public RPC (`https://rpc.hyperliquid.xyz/evm`).
Default user address for `user-positions`: positional `<address>` > `--address` > `HYPURR_USER_ADDRESS`.

**Important:** Never hardcode or expose private RPC API keys in commands or output.

## Commands

### 1. `markets` — Query all lending markets

Fetches every lending market across all protocols. Use filters and sorting to find what you need.

```bash
# All markets sorted by TVL (default)
node {baseDir}/../../dist/index.mjs markets

# Filter by market type
node {baseDir}/../../dist/index.mjs markets -t pooled
node {baseDir}/../../dist/index.mjs markets -t mewler-prime
node {baseDir}/../../dist/index.mjs markets -t mewler-yield
node {baseDir}/../../dist/index.mjs markets -t mewler-earn
node {baseDir}/../../dist/index.mjs markets -t isolated

# Filter by asset
node {baseDir}/../../dist/index.mjs markets -a USDC

# Top yields (sort by supply APY, highest first)
node {baseDir}/../../dist/index.mjs markets -s supply-apy -n 10

# Cheapest borrows (sort by borrow APY, lowest first)
node {baseDir}/../../dist/index.mjs markets -s borrow-apy -n 10

# Combined: Mewler Prime USDC markets with >$10k TVL
node {baseDir}/../../dist/index.mjs markets -t mewler-prime -a USDC --min-tvl 10000 -s supply-apy
```

**Options:**
- `-t, --type <type>` — Filter: `pooled`, `mewler-prime`, `mewler-yield`, `mewler-earn`, `isolated`
- `-a, --asset <symbol>` — Filter by asset symbol (e.g. `USDC`, `WHYPE`)
- `--min-tvl <usd>` — Minimum TVL in USD (default: 0)
- `-s, --sort <field>` — Sort: `tvl` (default), `supply-apy` (highest first), `borrow-apy` (lowest first)
- `-n, --limit <number>` — Limit results

**Response structure:**
```json
{
  "ok": true,
  "data": {
    "totalMarkets": 42,
    "filters": { "type": null, "asset": null, "minTvl": 0, "sort": "tvl", "limit": null },
    "byType": { "pooled": 10, "mewler-prime": 8, "mewler-yield": 6, "mewler-earn": 12, "isolated": 6 },
    "markets": [ ... ]
  },
  "meta": { "chain": "HyperEVM", "chainId": 999, "timestamp": "...", "source": "@hypurrfi/data-cli" }
}
```

**Market object fields by type:**

Common fields on all types:
- `address` — market/vault contract address
- `type` — market type identifier
- `name` — human-readable market name
- `assetSymbol`, `assetAddress`, `assetDecimals` — underlying asset info
- `priceUSD` — current USD price per 1 unit of asset
- `totalAssets` — total supplied amount (raw, in asset smallest unit)
- `totalBorrows` — total borrowed amount (raw, in asset smallest unit)
- `market` — market label (e.g. "HypurrFi Prime")
- `entity` — curator/manager name (e.g. "Clearstar")

To compute TVL in USD: `Number(totalAssets) / 10^assetDecimals * priceUSD`

Pooled (`type: "pooled"`):
- `supplyAPY` — annual supply yield (decimal, e.g. 0.03 = 3%)
- `borrowAPY` — annual borrow rate
- `reserveFactor` — percentage of borrow interest taken as protocol reserve (e.g. 20 = 20%). Higher factor means less of the borrow APY flows to suppliers.
- `utilization` — utilization percentage (e.g. 74.07 = 74.07%)
- `supplyCap` — max total supply cap (raw, smallest unit; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped)
- `borrowCap` — max total borrow cap (raw, smallest unit; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped or borrowing disabled)
- `maxLTV` — max loan-to-value ratio (percentage)
- `liquidationThreshold` — liquidation threshold (percentage)

Mewler Lending (`type: "mewler-prime"` or `"mewler-yield"`):
- `supplyAPY` — supply yield (after interest fee deduction)
- `borrowAPY` — borrow rate
- `interestFee` — percentage of borrow interest taken as protocol fee (e.g. 10 = 10%). Higher fee means more of the borrow APY is captured by the protocol rather than passed to suppliers.
- `utilization` — utilization percentage (e.g. 4.89 = 4.89%)
- `supplyCap` — max total supply cap (raw, smallest unit; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped)
- `borrowCap` — max total borrow cap (raw, smallest unit; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped or borrowing disabled)
- `canBeBorrowedByVaults` — number of collateral vaults accepted when borrowing from this vault
- `canBeUsedAsCollateralByVaults` — number of debt vaults where this vault is accepted as collateral
- `borrowableBy[]` — collateral vaults accepted by this vault, each with:
  - `vaultAddress`, `vaultName`, `vaultType`
  - `maxLTV` — max loan-to-value (percentage)
  - `liquidationThreshold` — liquidation threshold (percentage)
- `collateralIn[]` — debt vaults where this vault is accepted as collateral, with same fields as `borrowableBy[]`

Mewler Earn (`type: "mewler-earn"`):
- `supplyAPY` — weighted APY from underlying strategies (same field as other market types)
- `strategies` — array of underlying strategies with `shares`, `allocationShare`, `supplyAPY`, `isEscrow`
- `curator` — curator address

Isolated (`type: "isolated"`):
- `borrowAPY` — borrow rate
- `supplyAPY` — supply/deposit rate
- `utilization` — utilization percentage (e.g. 38.93 = 38.93%)
- `supplyCap` — max total supply/deposit cap (raw, smallest unit; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped)
- `borrowCap` — max total borrow cap (raw, smallest unit; protocol-specific sentinel values like `MAX_UINT*` may indicate uncapped or borrowing disabled)
- `collateralSymbol`, `collateralAddress`, `collateralDecimals` — collateral token info
- `collateralPriceUSD` — USD price per 1 unit of collateral (cross-priced via pair oracle)
- `exchangeRate` — oracle exchange rate (collateral → borrow asset, e.g. 1 USDXL = X UPUMP)
- `maxLTV` — max loan-to-value

### 2. `user-positions` — Get user's positions

```bash
node {baseDir}/../../dist/index.mjs user-positions 0xUSER_ADDRESS

# or use configured default address
node {baseDir}/../../dist/index.mjs user-positions
```

**Response structure:**
```json
{
  "ok": true,
  "data": {
    "address": "0x...",
    "pooled": {
      "totalCollateralUSD": 50000,
      "totalBorrowUSD": 20000,
      "availableBorrowsUSD": 15000,
      "healthFactor": 2.1,
      "ltv": 40,
      "supplies": [
        { "assetAddress": "0x...", "assetSymbol": "USDC", "amount": "25000000000", "amountUSD": 25000, "apy": 0.031 }
      ],
      "borrows": [
        { "assetAddress": "0x...", "assetSymbol": "USDC", "amount": "20000000000", "amountUSD": 20000, "apy": 0.052 }
      ]
    },
    "mewler": {
      "positionCount": 1,
      "totalCollateralUSD": 12000,
      "totalBorrowUSD": 5000,
      "positions": [
        {
          "subAccountId": 0,
          "subAccountAddress": "0x...",
          "controller": "0x...(debt vault)",
          "healthFactor": 2.61,
          "totalCollateralUSD": 12000,
          "totalBorrowUSD": 5000,
          "collaterals": [
            {
              "vaultAddress": "0x...",
              "vaultName": "EVK Vault eWHYPE-3",
              "market": "HypurrFi Yield",
              "assetSymbol": "WHYPE",
              "balance": "0.5",
              "balanceUSD": 10000,
              "supplyAPY": 5.3,
              "isEnabled": true
            }
          ],
          "borrows": [
            {
              "vaultAddress": "0x...",
              "vaultName": "EVK Vault eUSD₮0-3",
              "market": "HypurrFi Yield",
              "assetSymbol": "USD₮0",
              "debt": "5000",
              "borrowUSD": 5000,
              "borrowAPY": 5.18
            }
          ]
        }
      ]
    },
    "mewlerEarn": {
      "positionCount": 1,
      "totalBalanceUSD": 500,
      "positions": [
        {
          "vaultAddress": "0x...",
          "vaultName": "Mewler Earn USDC",
          "market": "Mewler Earn",
          "assetSymbol": "USDC",
          "balance": "500.0",
          "balanceUSD": 500
        }
      ]
    },
    "isolated": {
      "positionCount": 1,
      "totalDepositUSD": 1.0,
      "totalBorrowUSD": 0.1,
      "totalCollateralUSD": 0.48,
      "positions": [
        {
          "pairAddress": "0x...",
          "pairName": "hyUSD₮0 (USOL) - 8",
          "assetSymbol": "USD₮0",
          "collateralSymbol": "USOL",
          "depositShares": "1000000",
          "depositUSD": 1.0,
          "borrowShares": "500000",
          "borrowAmount": "100000",
          "borrowUSD": 0.1,
          "collateralBalance": "5876000",
          "collateralUSD": 0.48,
          "maxLTV": 50,
          "healthFactor": 1.85
        }
      ]
    }
  }
}
```

- `pooled` is `null` if user has no pooled position
- **Mewler section** (`mewler`) — lend/borrow positions grouped by sub-account:
  - Each sub-account has a unique `subAccountId` (0 = main account, 1–15/169 = additional)
  - `collaterals[]` — vaults where user has deposits; `isEnabled` indicates if EVC recognizes it as collateral for borrowing
  - `borrows[]` — vaults where user has debt
  - `controller` — the debt vault controlling this sub-account (`null` if no debt)
  - `healthFactor` — account-wide health via Account Lens; `null` if no debt
- **Mewler Earn section** (`mewlerEarn`) — deposit-only Earn vault positions:
  - Flat list, each with `vaultAddress`, `vaultName`, `market`, `assetSymbol`, `balance`, `balanceUSD`
  - No borrowing, no health factor
- **Isolated section** (`isolated`):
  - `positions[]` include USD values for deposits, debt, and collateral
- **Health factor** is available across all protocol types:
  - `pooled.healthFactor` — account-wide, from Aave Pool `getUserAccountData`
  - `mewler.positions[].healthFactor` — per-sub-account, from Euler Account Lens (`collateralValueLiquidation / liabilityValueLiquidation`); `null` if no debt
  - `isolated.positions[].healthFactor` — per-pair, formula: `(collateralAmount × collateralUnitPrice × maxLTV) / borrowAmount`; `null` if no borrow
- Health factor below 1.0 means the position is at liquidation risk

### 3. `prices` — Token prices

```bash
# All known tokens
node {baseDir}/../../dist/index.mjs prices

# Specific tokens
node {baseDir}/../../dist/index.mjs prices --tokens 0xAddr1,0xAddr2
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "count": 5,
    "prices": [
      { "address": "0x...", "symbol": "WHYPE", "decimals": 18, "priceUSD": 5.23 }
    ]
  }
}
```

## Global Options

- `--rpc <url>` — Custom RPC URL (default: HyperEVM public RPC)
- `--address <wallet>` — Default wallet address for `user-positions` (overrides `HYPURR_USER_ADDRESS`)

## Decision-Making Guide

When helping users with lending decisions, follow this workflow:

### Finding best yields
1. Run `markets -s supply-apy -n 10` to get top supply opportunities
2. Optionally filter by asset: `markets -s supply-apy -a USDC`
3. Key field: `supplyAPY` (consistent across all market types)
4. Consider TVL (`totalAssets * priceUSD / 10^decimals`) for liquidity risk

### Finding cheapest borrows
1. Run `markets -s borrow-apy -n 10`
2. Key field: `borrowAPY` — lower is better
3. Check collateral requirements: `ltv`/`liquidationThreshold` (pooled), `maxLTV` (isolated)

### Checking user health
1. Run `user-positions <address>`
2. Check health factors across all protocols — warn if below 1.5, critical if below 1.1:
   - `pooled.healthFactor` — account-wide health for pooled positions
   - `mewler.positions[].healthFactor` — per-sub-account health (non-null when `borrows` is non-empty)
   - `isolated.positions[].healthFactor` — per-pair health (non-null when `borrowUSD > 0`)
3. Review Mewler `collaterals[]` with `isEnabled` flag — only enabled collaterals back borrowing
4. Compare `totalCollateralUSD` vs `totalBorrowUSD` across all protocols
5. Mewler `earnPositions` are deposit-only — no health factor concern

### Suggesting optimizations
1. Get user positions: `user-positions <address>`
2. Get current market rates: `markets -s supply-apy`
3. Compare user's current supply APYs against available market rates for the same asset
4. If a higher-yield opportunity exists for the same asset, suggest moving
5. For borrows, compare current borrow APYs against `markets -s borrow-apy` — suggest refinancing if cheaper rates exist
6. Always warn about gas costs and potential liquidation risks when suggesting moves

### Understanding market types
- **Pooled**: Shared liquidity pool, any listed asset can be supplied/borrowed. Most liquid but typically lower yields.
- **Mewler Prime**: Conservative vaults with blue-chip collateral. Lower risk, moderate yields.
- **Mewler Yield**: Yield-optimized vaults. Higher yields, slightly more risk.
- **Mewler Earn**: Curated ERC-4626 vaults with underlying strategies. Deposit-only (no borrowing). APY from strategy allocation.
- **Isolated**: Single collateral/borrow pairs. Higher yields but concentrated risk. Each pair is independent.
