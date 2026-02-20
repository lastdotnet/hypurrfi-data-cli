import type { Address, PublicClient } from 'viem'
import { HEALTH_FACTOR_RISK_THRESHOLD } from '../config/constants.js'
import { fetchUserPositions } from '../fetchers/user.js'
import { type OutputFormat, error, print, printCSV, success } from '../output.js'

/** Collateral USD value at which liquidation triggers (HF = 1). */
function liquidationThresholdUSD(collateralUSD: number, hf: number | null): number | null {
  if (hf === null || hf <= 0) return null
  return collateralUSD / hf
}

function atRisk(hf: number | null): boolean {
  return hf !== null && hf > 0 && hf < HEALTH_FACTOR_RISK_THRESHOLD
}

/** Net APY on equity: (supply income - borrow cost) / equity. Returns percentage or null. */
function computeNetAPY(
  supplyItems: { usd: number; apy: number }[],
  borrowItems: { usd: number; apy: number }[],
  equity: number,
): number | null {
  if (equity <= 0) return null
  const supplyIncome = supplyItems.reduce((sum, s) => sum + s.usd * s.apy, 0)
  const borrowCost = borrowItems.reduce((sum, b) => sum + b.usd * b.apy, 0)
  return (supplyIncome - borrowCost) / equity
}

export async function userPositionsCommand(
  client: PublicClient,
  address: string,
  format: OutputFormat = 'json',
): Promise<void> {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    print(
      error(
        'Invalid or missing address. Provide `user-positions <address>`, or set `--address <wallet>` / `HYPURR_USER_ADDRESS`.',
      ),
    )
    process.exit(1)
  }

  const positions = await fetchUserPositions(client, address as Address)

  const healthFactors: number[] = []
  if (positions.pooled && positions.pooled.healthFactor > 0) {
    healthFactors.push(positions.pooled.healthFactor)
  }
  for (const p of positions.mewlerPositions) {
    if (p.healthFactor !== null && p.healthFactor > 0) healthFactors.push(p.healthFactor)
  }
  for (const p of positions.isolatedPositions) {
    if (p.healthFactor !== null && p.healthFactor > 0) healthFactors.push(p.healthFactor)
  }

  const lowestHealthFactor = healthFactors.length > 0 ? Math.min(...healthFactors) : null

  if (format === 'csv') {
    printCSV(flattenPositions(positions))
    return
  }

  const summary = {
    address: positions.address,
    lowestHealthFactor,
    isAtRisk: atRisk(lowestHealthFactor),
    pooled: positions.pooled
      ? (() => {
          const p = positions.pooled!
          const totalLiquidityUSD = p.supplies.reduce((s, x) => s + x.amountUSD, 0)
          const netWorth = totalLiquidityUSD - p.totalBorrowUSD
          return {
            totalCollateralUSD: p.totalCollateralUSD,
            totalBorrowUSD: p.totalBorrowUSD,
            availableBorrowsUSD: p.availableBorrowsUSD,
            healthFactor: p.healthFactor,
            isAtRisk: atRisk(p.healthFactor),
            liquidationCollateralUSD: liquidationThresholdUSD(p.totalCollateralUSD, p.healthFactor),
            ltv: p.ltv,
            netWorthUSD: netWorth,
            netAPY: computeNetAPY(
              p.supplies.map((s) => ({ usd: s.amountUSD, apy: s.apy })),
              p.borrows.map((b) => ({ usd: b.amountUSD, apy: b.apy })),
              netWorth,
            ),
            supplies: p.supplies,
            borrows: p.borrows,
          }
        })()
      : null,
    mewler: {
      positionCount: positions.mewlerPositions.length,
      totalCollateralUSD: positions.mewlerPositions.reduce((sum, p) => sum + p.totalCollateralUSD, 0),
      totalBorrowUSD: positions.mewlerPositions.reduce((sum, p) => sum + p.totalBorrowUSD, 0),
      positions: positions.mewlerPositions.map((p) => {
        const equity = p.totalCollateralUSD - p.totalBorrowUSD
        return {
          subAccountId: p.subAccountId,
          subAccountAddress: p.subAccountAddress,
          controller: p.controller,
          healthFactor: p.healthFactor,
          isAtRisk: atRisk(p.healthFactor),
          liquidationCollateralUSD: liquidationThresholdUSD(p.totalCollateralUSD, p.healthFactor),
          totalCollateralUSD: p.totalCollateralUSD,
          totalBorrowUSD: p.totalBorrowUSD,
          netAPY: computeNetAPY(
            p.collaterals.map((c) => ({ usd: c.balanceUSD, apy: c.supplyAPY })),
            p.borrows.map((b) => ({ usd: b.borrowUSD, apy: b.borrowAPY })),
            equity,
          ),
          collaterals: p.collaterals,
          borrows: p.borrows,
        }
      }),
    },
    mewlerEarn: {
      positionCount: positions.mewlerEarnPositions.length,
      totalBalanceUSD: positions.mewlerEarnPositions.reduce((sum, p) => sum + p.balanceUSD, 0),
      positions: positions.mewlerEarnPositions,
    },
    isolated: {
      positionCount: positions.isolatedPositions.length,
      totalDepositUSD: positions.isolatedPositions.reduce((sum, p) => sum + p.depositUSD, 0),
      totalBorrowUSD: positions.isolatedPositions.reduce((sum, p) => sum + p.borrowUSD, 0),
      totalCollateralUSD: positions.isolatedPositions.reduce((sum, p) => sum + p.collateralUSD, 0),
      positions: positions.isolatedPositions.map((p) => {
        const equity = p.depositUSD + p.collateralUSD - p.borrowUSD
        return {
          ...p,
          isAtRisk: atRisk(p.healthFactor),
          netAPY: computeNetAPY(
            [{ usd: p.depositUSD, apy: p.supplyAPY }],
            [{ usd: p.borrowUSD, apy: p.borrowAPY }],
            equity,
          ),
        }
      }),
    },
  }

  print(success(summary))
}

// ── CSV flattening ────────────────────────────────────────────────

import type { UserPositionSummary } from '../types.js'

function flattenPositions(pos: UserPositionSummary): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []

  if (pos.pooled) {
    const p = pos.pooled
    for (const s of p.supplies) {
      rows.push({
        protocol: 'pooled',
        side: 'supply',
        assetSymbol: s.assetSymbol,
        assetAddress: s.assetAddress,
        amount: s.amount,
        amountUSD: s.amountUSD,
        apy: s.apy,
        healthFactor: p.healthFactor,
        isAtRisk: atRisk(p.healthFactor),
      })
    }
    for (const b of p.borrows) {
      rows.push({
        protocol: 'pooled',
        side: 'borrow',
        assetSymbol: b.assetSymbol,
        assetAddress: b.assetAddress,
        amount: b.amount,
        amountUSD: b.amountUSD,
        apy: b.apy,
        healthFactor: p.healthFactor,
        isAtRisk: atRisk(p.healthFactor),
      })
    }
  }

  for (const sub of pos.mewlerPositions) {
    for (const c of sub.collaterals) {
      rows.push({
        protocol: 'mewler',
        side: 'collateral',
        subAccountId: sub.subAccountId,
        assetSymbol: c.assetSymbol,
        assetAddress: c.vaultAddress,
        amount: c.balance,
        amountUSD: c.balanceUSD,
        apy: c.supplyAPY,
        healthFactor: sub.healthFactor,
        isAtRisk: atRisk(sub.healthFactor),
      })
    }
    for (const b of sub.borrows) {
      rows.push({
        protocol: 'mewler',
        side: 'borrow',
        subAccountId: sub.subAccountId,
        assetSymbol: b.assetSymbol,
        assetAddress: b.vaultAddress,
        amount: b.debt,
        amountUSD: b.borrowUSD,
        apy: b.borrowAPY,
        healthFactor: sub.healthFactor,
        isAtRisk: atRisk(sub.healthFactor),
      })
    }
  }

  for (const e of pos.mewlerEarnPositions) {
    rows.push({
      protocol: 'mewler-earn',
      side: 'deposit',
      subAccountId: null,
      assetSymbol: e.assetSymbol,
      assetAddress: e.vaultAddress,
      amount: e.balance,
      amountUSD: e.balanceUSD,
      apy: null,
      healthFactor: null,
      isAtRisk: false,
    })
  }

  for (const iso of pos.isolatedPositions) {
    if (iso.depositUSD > 0) {
      rows.push({
        protocol: 'isolated',
        side: 'supply',
        subAccountId: null,
        assetSymbol: iso.assetSymbol,
        assetAddress: iso.pairAddress,
        amount: iso.depositShares,
        amountUSD: iso.depositUSD,
        apy: iso.supplyAPY,
        healthFactor: iso.healthFactor,
        isAtRisk: atRisk(iso.healthFactor),
      })
    }
    if (iso.borrowUSD > 0) {
      rows.push({
        protocol: 'isolated',
        side: 'borrow',
        subAccountId: null,
        assetSymbol: iso.assetSymbol,
        assetAddress: iso.pairAddress,
        amount: iso.borrowAmount,
        amountUSD: iso.borrowUSD,
        apy: iso.borrowAPY,
        healthFactor: iso.healthFactor,
        isAtRisk: atRisk(iso.healthFactor),
      })
    }
    if (iso.collateralUSD > 0) {
      rows.push({
        protocol: 'isolated',
        side: 'collateral',
        subAccountId: null,
        assetSymbol: iso.collateralSymbol,
        assetAddress: iso.pairAddress,
        amount: iso.collateralBalance,
        amountUSD: iso.collateralUSD,
        apy: null,
        healthFactor: iso.healthFactor,
        isAtRisk: atRisk(iso.healthFactor),
      })
    }
  }

  return rows
}
