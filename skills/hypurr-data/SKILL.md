---
name: hypurr-data
description: Query HypurrFi lending protocol data on HyperEVM — markets, yields, borrows, user positions, and token prices across Pooled, Mewler (Prime/Yield/Earn), and Isolated markets.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["HYPEREVM_RPC_URL", "HYPURR_USER_ADDRESS"] }, "primaryEnv": "HYPEREVM_RPC_URL" } }
---

# HypurrFi Data API

You have access to the `hypurr-data` CLI tool that fetches real-time on-chain lending data from HyperEVM. Use it to answer questions about yields, borrow rates, user positions, and token prices.

## How to Run

```bash
npx hypurr-data <command> [options]
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
npx hypurr-data --rpc https://your-rpc-url markets
```

Priority: `--rpc` flag > `HYPEREVM_RPC_URL` env var > public RPC (`https://rpc.hyperliquid.xyz/evm`).
Default user address for `user-positions`: positional `<address>` > `--address` > `HYPURR_USER_ADDRESS`.

**Important:** Never hardcode or expose private RPC API keys in commands or output.

## Commands

### 1. `markets` — Query all lending markets

Fetches every lending market across all protocols. Use filters and sorting to find what you need.

```bash
# All markets sorted by TVL (default)
npx hypurr-data markets

# Filter by market type
npx hypurr-data markets -t pooled
npx hypurr-data markets -t mewler-prime
npx hypurr-data markets -t mewler-yield
npx hypurr-data markets -t mewler-earn
npx hypurr-data markets -t isolated

# Filter by asset
npx hypurr-data markets -a USDC

# Top yields (sort by supply APY, highest first)
npx hypurr-data markets -s supply-apy -n 10

# Cheapest borrows (sort by borrow APY, lowest first)
npx hypurr-data markets -s borrow-apy -n 10

# Combined: Mewler Prime USDC markets with >$10k TVL
npx hypurr-data markets -t mewler-prime -a USDC --min-tvl 10000 -s supply-apy
```

**Options:**
- `-t, --type <type>` — Filter: `pooled`, `mewler-prime`, `mewler-yield`, `mewler-earn`, `isolated`. Returns `ok: false` with error message if an invalid type is provided.
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
    "totalsUSD": { "supplied": 67160000, "borrowed": 25100000, "available": 42060000 },
    "filters": { "type": null, "asset": null, "minTvl": 0, "sort": "tvl", "limit": null },
    "byType": { "pooled": 10, "mewler-prime": 8, "mewler-yield": 6, "mewler-earn": 12, "isolated": 6 },
    "apyBasis": { "pooled": "365d", "mewler-prime": "365.25d", "mewler-yield": "365.25d", "mewler-earn": "365.25d", "isolated": "365.2425d" },
    "markets": [ ... ]
  },
  "warnings": [],
  "meta": { "chain": "HyperEVM", "chainId": 999, "timestamp": "...", "source": "@hypurrfi/data-cli" }
}
```

- `totalsUSD` — aggregate USD values across all markets (excluding earn vaults to avoid double-counting). `supplied` includes collateral for isolated markets.
- `apyBasis` — year-length convention used per protocol for APY compounding.
- `warnings` — array of strings when some protocol data is unavailable (e.g. `"Pooled markets unavailable: fetch failed"`). Empty array or absent when all data is complete.

**Market object fields by type:**

Common fields on all types:
- `address` — market/vault contract address
- `type` — market type identifier
- `name` — human-readable market name
- `assetSymbol`, `assetAddress`, `assetDecimals` — underlying asset info
- `priceUSD` — current USD price per 1 unit of asset
- `totalAssets` — total supplied amount (raw, in asset smallest unit)
- `totalBorrows` — total borrowed amount (raw, in asset smallest unit)
- `totalAssetsUSD` — pre-computed total supplied in USD
- `totalBorrowsUSD` — pre-computed total borrowed in USD
- `market` — market label (e.g. "HypurrFi Prime")
- `entity` — curator/manager name (e.g. "Clearstar")

Pooled (`type: "pooled"`):
- `supplyAPY` — annual supply yield (decimal, e.g. 0.03 = 3%)
- `borrowAPY` — annual borrow rate
- `reserveFactor` — percentage of borrow interest taken as protocol reserve (e.g. 20 = 20%). Higher factor means less of the borrow APY flows to suppliers.
- `utilization` — utilization percentage (e.g. 74.07 = 74.07%)
- `supplyCap` — max total supply cap (raw, smallest unit; `null` = uncapped)
- `borrowCap` — max total borrow cap (raw, smallest unit; `null` = uncapped)
- `maxLTV` — max loan-to-value ratio (percentage)
- `liquidationThreshold` — liquidation threshold (percentage)

Mewler Lending (`type: "mewler-prime"` or `"mewler-yield"`):
- `supplyAPY` — supply yield (after interest fee deduction)
- `borrowAPY` — borrow rate
- `interestFee` — percentage of borrow interest taken as protocol fee (e.g. 10 = 10%). Higher fee means more of the borrow APY is captured by the protocol rather than passed to suppliers.
- `utilization` — utilization percentage (e.g. 4.89 = 4.89%)
- `supplyCap` — max total supply cap (raw, smallest unit; `null` = uncapped)
- `borrowCap` — max total borrow cap (raw, smallest unit; `null` = uncapped)
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
- `supplyCap` — max total supply/deposit cap (raw, smallest unit; `null` = uncapped)
- `borrowCap` — max total borrow cap (raw, smallest unit; `null` = uncapped)
- `collateralSymbol`, `collateralAddress`, `collateralDecimals` — collateral token info
- `collateralPriceUSD` — USD price per 1 unit of collateral (cross-priced via pair oracle)
- `totalCollateral` — total collateral deposited (raw, in collateral smallest unit)
- `totalCollateralUSD` — pre-computed total collateral in USD
- `exchangeRate` — oracle exchange rate (collateral → borrow asset, e.g. 1 USDXL = X UPUMP)
- `maxLTV` — max loan-to-value

### 2. `user-positions` — Get user's positions

```bash
npx hypurr-data user-positions 0xUSER_ADDRESS

# or use configured default address
npx hypurr-data user-positions
```

**Response structure:**
```json
{
  "ok": true,
  "data": {
    "address": "0x...",
    "lowestHealthFactor": 1.85,
    "isAtRisk": false,
    "pooled": {
      "totalCollateralUSD": 50000,
      "totalBorrowUSD": 20000,
      "availableBorrowsUSD": 15000,
      "healthFactor": 2.1,
      "isAtRisk": false,
      "liquidationCollateralUSD": 23809.52,
      "ltv": 40,
      "netWorthUSD": 30000,
      "netAPY": 0.57,
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
          "isAtRisk": false,
          "liquidationCollateralUSD": 4597.70,
          "totalCollateralUSD": 12000,
          "totalBorrowUSD": 5000,
          "netAPY": 3.88,
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
          "supplyAPY": 3.2,
          "borrowAPY": 8.5,
          "maxLTV": 50,
          "healthFactor": 1.85,
          "isAtRisk": false,
          "liquidationPrice": 0.044,
          "netAPY": -1.4
        }
      ]
    }
  }
}
```

- `lowestHealthFactor` — minimum health factor across all borrow positions (pooled, mewler, isolated). `null` if no active borrows. Quick check for at-risk wallets.
- `isAtRisk` — `true` when health factor < 1.5 (threshold defined in `HEALTH_FACTOR_RISK_THRESHOLD`). Available at top level (based on `lowestHealthFactor`) and on each pooled, mewler subaccount, and isolated position. Agents can filter on this boolean without comparing numbers.
- `pooled` is `null` if user has no pooled position; includes `netAPY` (return on equity after borrow costs, in percentage)
- `netAPY` — available on pooled, each mewler subaccount, and each isolated position. Formula: `(supply_income - borrow_cost) / net_worth`. For pooled, `net_worth = sum(deposit_USD) - total_borrow_USD` (uses actual deposit values, not LTV-weighted collateral). Positive = earning, negative = costs exceed earnings. `null` if net worth ≤ 0.
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
  - `positions[]` include USD values for deposits, debt, and collateral; `supplyAPY`, `borrowAPY`, and `netAPY`
- **Health factor** is available across all protocol types:
  - `pooled.healthFactor` — account-wide, from Aave Pool `getUserAccountData`
  - `mewler.positions[].healthFactor` — per-sub-account, from Euler Account Lens (`collateralValueLiquidation / liabilityValueLiquidation`); `null` if no debt
  - `isolated.positions[].healthFactor` — per-pair, formula: `(collateralAmount × collateralUnitPrice × maxLTV) / borrowAmount`; `null` if no borrow
- Health factor below 1.0 means the position is at liquidation risk
- **Liquidation thresholds** for building alerts:
  - `pooled.liquidationCollateralUSD` — USD value of collateral at which HF hits 1 (liquidation). Compare against `totalCollateralUSD` to gauge distance to liquidation.
  - `mewler.positions[].liquidationCollateralUSD` — same, per sub-account
  - `isolated.positions[].liquidationPrice` — USD price of the collateral token at which liquidation triggers. `null` if no borrow.

### 3. `prices` — Token prices

```bash
# All known tokens
npx hypurr-data prices

# Specific tokens
npx hypurr-data prices --tokens 0xAddr1,0xAddr2
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
- `--format <json|csv>` — Output format (default: `json`). Use `csv` for tabular output that agents can parse as rows/columns.

### CSV format notes

When `--format=csv` is used:
- **markets**: one row per market with flat columns (type, assetSymbol, supplyAPY, borrowAPY, totalAssetsUSD, etc.). Isolated markets include extra columns for collateral.
- **prices**: one row per token (address, symbol, decimals, priceUSD).
- **user-positions**: one row per supply/borrow/collateral entry across all protocols. Columns: `protocol`, `side` (supply|borrow|collateral|deposit), `subAccountId`, `assetSymbol`, `assetAddress`, `amount`, `amountUSD`, `apy`, `healthFactor`, `isAtRisk`.
- CSV mode omits the `ok`/`meta`/`warnings` wrapper — it outputs raw rows only.
- Errors still output JSON (they have no tabular form).

## Decision-Making Guide

When helping users with lending decisions, follow this workflow:

### Finding best yields
1. Run `markets -s supply-apy -n 10` to get top supply opportunities
2. Optionally filter by asset: `markets -s supply-apy -a USDC`
3. Key field: `supplyAPY` (consistent across all market types)
4. Consider TVL via `totalAssetsUSD` for liquidity risk

### Finding cheapest borrows
1. Run `markets -s borrow-apy -n 10`
2. Key field: `borrowAPY` — lower is better
3. Check collateral requirements: `ltv`/`liquidationThreshold` (pooled), `maxLTV` (isolated)

### Checking user health
1. Run `user-positions <address>`
2. Quick check: `isAtRisk` (top-level) — `true` when any position has HF < 1.5. Also available per-position.
3. For severity: `lowestHealthFactor` — below 1.5 warn, below 1.1 critical
4. For detailed analysis, check per-protocol:
   - `pooled.healthFactor` and `pooled.liquidationCollateralUSD` — how far collateral is from liquidation threshold
   - `mewler.positions[].healthFactor` and `liquidationCollateralUSD` — per-sub-account
   - `isolated.positions[].healthFactor` and `liquidationPrice` — concrete USD price of collateral at which liquidation triggers
4. Review Mewler `collaterals[]` with `isEnabled` flag — only enabled collaterals back borrowing
5. Compare `totalCollateralUSD` vs `totalBorrowUSD` across all protocols
6. Mewler `earnPositions` are deposit-only — no health factor concern

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
