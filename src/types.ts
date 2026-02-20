import type { Address } from 'viem'

// ── Lens contract response shapes ──────────────────────────────────

/** Subset of vaultLens.getVaultInfoFull that we consume */
export interface VaultLensInfo {
  vaultName: string
  asset: Address
  assetDecimals: bigint
  assetSymbol: string
  totalAssets: bigint
  totalBorrowed: bigint
  unitOfAccountDecimals: bigint
  interestFee: bigint
  supplyCap: bigint
  borrowCap: bigint
  governorAdmin: Address
  irmInfo: {
    queryFailure: boolean
    interestRateInfo: readonly { borrowAPY: bigint; supplyAPY: bigint }[]
  }
  liabilityPriceInfo: {
    queryFailure: boolean
    amountOutMid: bigint
  }
  collateralLTVInfo: readonly {
    collateral: Address
    borrowLTV: bigint
    liquidationLTV: bigint
    targetTimestamp: bigint
  }[]
}

/** Subset of eulerEarnVaultLens.getVaultInfoFull that we consume */
export interface EarnVaultLensInfo {
  vaultName: string
  asset: Address
  assetDecimals: bigint
  assetSymbol: string
  totalAssets: bigint
  performanceFee: bigint
  curator: Address
  strategies: readonly {
    strategy: Address
    allocatedAssets: bigint
    info: { isEVault: boolean }
  }[]
}

/** Subset of accountLens.getAccountInfo that we consume */
export interface AccountLensInfo {
  vaultAccountInfo: {
    liquidityInfo: {
      queryFailure: boolean
      collateralValueLiquidation: bigint
      liabilityValueLiquidation: bigint
    }
  }
}

/** Isolated previewAddInterest rate info tuple-object */
export interface IsolatedRateInfo {
  ratePerSec: bigint
  feeToProtocolRate: bigint
}

// ── Market types ───────────────────────────────────────────────────

export type MarketType = 'pooled' | 'mewler-prime' | 'mewler-yield' | 'mewler-earn' | 'isolated'

export interface MarketBase {
  address: Address
  type: MarketType
  name: string
  assetSymbol: string
  assetAddress: Address
  assetDecimals: number
  priceUSD: number
  market: string | null
  entity: string | null
  totalAssets: string
  totalBorrows: string
  totalAssetsUSD: number
  totalBorrowsUSD: number
}

/** Pooled market */
export interface PooledMarket extends MarketBase {
  type: 'pooled'
  supplyAPY: number
  borrowAPY: number
  reserveFactor: number
  utilization: number
  supplyCap: string | null
  borrowCap: string | null
  maxLTV: number
  liquidationThreshold: number
  aTokenAddress: Address
}

/** Mewler lending vault (prime or yield) */
export interface MewlerVaultLTVInfo {
  vaultAddress: Address
  vaultName: string
  vaultType: 'mewler-prime' | 'mewler-yield'
  maxLTV: number
  liquidationThreshold: number
}

export interface MewlerLendMarket extends MarketBase {
  type: 'mewler-prime' | 'mewler-yield'
  supplyAPY: number
  borrowAPY: number
  interestFee: number
  utilization: number
  supplyCap: string | null
  borrowCap: string | null
  canBeBorrowedByVaults: number
  canBeUsedAsCollateralByVaults: number
  borrowableBy: MewlerVaultLTVInfo[]
  collateralIn: MewlerVaultLTVInfo[]
}

/** Mewler Earn vault */
export interface MewlerEarnVault extends MarketBase {
  type: 'mewler-earn'
  supplyAPY: number
  curator: Address | null
  strategies: StrategyInfo[]
  performanceFee: string
}

export interface StrategyInfo {
  address: Address
  name: string | null
  shares: string
  allocationShare: number
  supplyAPY: number
  isEscrow: boolean
}

/** Isolated market */
export interface IsolatedMarket extends MarketBase {
  type: 'isolated'
  borrowAPY: number
  supplyAPY: number
  utilization: number
  supplyCap: string | null
  borrowCap: string | null
  collateralSymbol: string
  collateralAddress: Address
  collateralDecimals: number
  collateralPriceUSD: number
  totalCollateral: string
  totalCollateralUSD: number
  exchangeRate: number
  maxLTV: number
}

export type Market = PooledMarket | MewlerLendMarket | MewlerEarnVault | IsolatedMarket

/** Token price info */
export interface TokenPrice {
  address: Address
  symbol: string
  decimals: number
  priceUSD: number
}

/** User position across protocols */
export interface UserPositionSummary {
  address: Address
  pooled: PooledUserPosition | null
  mewlerPositions: MewlerSubAccountPosition[]
  mewlerEarnPositions: MewlerEarnPosition[]
  isolatedPositions: IsolatedUserPosition[]
}

export interface PooledUserPosition {
  totalCollateralUSD: number
  totalBorrowUSD: number
  availableBorrowsUSD: number
  healthFactor: number
  ltv: number
  supplies: PooledAssetPosition[]
  borrows: PooledAssetPosition[]
}

export interface PooledAssetPosition {
  assetAddress: Address
  assetSymbol: string
  amount: string
  amountUSD: number
  apy: number
}

/** Mewler position grouped by sub-account (matching FE SubAccountSummary) */
export interface MewlerSubAccountPosition {
  subAccountId: number
  subAccountAddress: Address
  controller: Address | null
  healthFactor: number | null
  totalCollateralUSD: number
  totalBorrowUSD: number
  collaterals: MewlerCollateralPosition[]
  borrows: MewlerBorrowPosition[]
}

export interface MewlerCollateralPosition {
  vaultAddress: Address
  vaultName: string
  market: string | null
  assetSymbol: string
  balance: string
  balanceUSD: number
  supplyAPY: number
  isEnabled: boolean
}

export interface MewlerBorrowPosition {
  vaultAddress: Address
  vaultName: string
  market: string | null
  assetSymbol: string
  debt: string
  borrowUSD: number
  borrowAPY: number
}

/** Mewler Earn vault — deposit-only, single asset */
export interface MewlerEarnPosition {
  vaultAddress: Address
  vaultName: string
  market: string | null
  assetSymbol: string
  balance: string
  balanceUSD: number
}

export interface IsolatedUserPosition {
  pairAddress: Address
  pairName: string
  assetSymbol: string
  collateralSymbol: string
  depositShares: string
  depositUSD: number
  borrowShares: string
  borrowAmount: string
  borrowUSD: number
  collateralBalance: string
  collateralUSD: number
  supplyAPY: number
  borrowAPY: number
  maxLTV: number
  healthFactor: number | null
  liquidationPrice: number | null
}
