import { APY_RAY_DECIMALS, EULER_FEE_SCALE, ISOLATED_RATE_PRECISION } from '../config/constants'

/** Pooled uses 365 days (matches FE pooledDataFetcher.ts) */
const POOLED_SECONDS_PER_YEAR = 60 * 60 * 24 * 365 // 31,536,000

/** Mewler uses 365.25 days (matches FE onchainHelpers.ts) */
const MEWLER_SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60 // 31,557,600

/** Isolated uses 365.2425 days (matches FE useIsolatedPairs.ts) */
const ISOLATED_SECONDS_PER_YEAR = 31_556_952

/**
 * Convert pooled ray rate (27 decimals, annualized) to APY percentage.
 * Formula: ((rate/1e27/SECONDS + 1)^SECONDS - 1) * 100
 */
export function rayRateToAPY(rayRate: bigint): number {
  if (rayRate === 0n) return 0
  const rateDecimal = Number(rayRate) / 10 ** APY_RAY_DECIMALS
  return ((rateDecimal / POOLED_SECONDS_PER_YEAR + 1) ** POOLED_SECONDS_PER_YEAR - 1) * 100
}

/**
 * Euler borrow APY from interest rate (27-decimal per-second rate).
 * Formula: ((1 + ratePerSecond)^SECONDS - 1) * 100
 */
export function eulerBorrowAPY(interestRate: bigint): number {
  if (interestRate === 0n) return 0
  const ratePerSecond = Number(interestRate) / 10 ** APY_RAY_DECIMALS
  return ((1 + ratePerSecond) ** MEWLER_SECONDS_PER_YEAR - 1) * 100
}

/**
 * Euler supply APY: borrowAPY * utilization * (1 - interestFee)
 * interestFee is in basis points where 10000 = 100%
 */
export function eulerSupplyAPY(interestRate: bigint, utilization: number, interestFee = 0n): number {
  const borrowApy = eulerBorrowAPY(interestRate)
  const feeMultiplier = 1 - Number(interestFee) / EULER_FEE_SCALE
  return borrowApy * utilization * feeMultiplier
}

/**
 * Calculate utilization ratio from totalBorrows / totalAssets.
 * Uses BigInt-native scaling to avoid precision loss with large values (>2^53).
 */
export function calculateUtilization(totalBorrows: bigint, totalAssets: bigint): number {
  if (totalAssets === 0n) return 0
  return Number((totalBorrows * 1_000_000n) / totalAssets) / 1_000_000
}

/**
 * Isolated borrow APY using continuous compounding.
 * Formula: (e^(ratePerSec * SECONDS) - 1) * 100
 */
export function isolatedBorrowAPY(ratePerSec: bigint): number {
  if (ratePerSec === 0n) return 0
  const rate = Number(ratePerSec) / ISOLATED_RATE_PRECISION
  return (Math.exp(rate * ISOLATED_SECONDS_PER_YEAR) - 1) * 100
}

/**
 * Isolated deposit APY: borrowAPY * utilization * (1 - feeToProtocolRate)
 */
export function isolatedDepositAPY(borrowApy: number, utilization: number, feeToProtocolRate: number): number {
  return borrowApy * (utilization / 100) * (1 - feeToProtocolRate)
}
