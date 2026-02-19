export const DEFAULT_DECIMALS = 18
export const PRICE_DECIMALS = 18
export const AAVE_ORACLE_DECIMALS = 8
export const APY_RAY_DECIMALS = 27
export const EULER_FEE_SCALE = 10_000
export const ISOLATED_LTV_PRECISION = 1e5
export const ISOLATED_RATE_PRECISION = 1e18
export const PERFORMANCE_FEE_PRECISION = 1e18
export const LTV_BPS_DIVISOR = 100
export const MAX_UINT256 = (1n << 256n) - 1n

/** Main account + sub-accounts 1–15 + special sub-account 169 */
export const SUB_ACCOUNT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 169] as const
