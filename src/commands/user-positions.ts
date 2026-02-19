import type { Address, PublicClient } from 'viem'
import { fetchUserPositions } from '../fetchers/user.js'
import { print, success } from '../output.js'

export async function userPositionsCommand(client: PublicClient, address: string): Promise<void> {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    print({
      ok: false,
      data: {
        error:
          'Invalid or missing address. Provide `user-positions <address>`, or set `--address <wallet>` / `HYPURR_USER_ADDRESS`.',
      },
      meta: {
        chain: 'HyperEVM',
        chainId: 999,
        timestamp: new Date().toISOString(),
        source: '@hypurrfi/data-cli',
      },
    })
    process.exit(1)
  }

  const positions = await fetchUserPositions(client, address as Address)

  const summary = {
    address: positions.address,
    pooled: positions.pooled
      ? {
          ...positions.pooled,
          netWorthUSD: positions.pooled.totalCollateralUSD - positions.pooled.totalBorrowUSD,
        }
      : null,
    mewler: {
      positionCount: positions.mewlerPositions.length,
      totalCollateralUSD: positions.mewlerPositions.reduce((sum, p) => sum + p.totalCollateralUSD, 0),
      totalBorrowUSD: positions.mewlerPositions.reduce((sum, p) => sum + p.totalBorrowUSD, 0),
      positions: positions.mewlerPositions,
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
      positions: positions.isolatedPositions,
    },
  }

  print(success(summary))
}
