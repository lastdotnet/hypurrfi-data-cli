import { type Address, type PublicClient, formatUnits, erc20Abi as viemErc20Abi } from 'viem'
import { rayRateToAPY } from '../calculations/apy.js'
import { aaveOracleAbi, addressProviderAbi, poolAbi } from '../config/abis.js'
import { AAVE_ORACLE_DECIMALS, DEFAULT_DECIMALS } from '../config/constants.js'
import { POOL_ADDRESS, POOL_ADDRESS_PROVIDER } from '../config/contracts.js'
import type { PooledAssetPosition, PooledMarket, PooledUserPosition } from '../types.js'

// ── Config bit decoders ────────────────────────────────────────────

function decodeLTV(configData: bigint): number {
  return Number(configData & 0xffffn) / 100
}

function decodeLiquidationThreshold(configData: bigint): number {
  return Number((configData >> 16n) & 0xffffn) / 100
}

function decodeBorrowCapRaw(configData: bigint, decimals: number): string | null {
  const capWholeTokens = (configData >> 80n) & ((1n << 36n) - 1n)
  if (capWholeTokens === 0n) return null
  return (capWholeTokens * 10n ** BigInt(decimals)).toString()
}

function decodeReserveFactor(configData: bigint): number {
  return Number((configData >> 64n) & 0xffffn) / 100
}

function decodeSupplyCapRaw(configData: bigint, decimals: number): string | null {
  const capWholeTokens = (configData >> 116n) & ((1n << 36n) - 1n)
  if (capWholeTokens === 0n) return null
  return (capWholeTokens * 10n ** BigInt(decimals)).toString()
}

// ── Market fetching ────────────────────────────────────────────────

interface ReserveOnChain {
  address: Address
  symbol: string
  decimals: number
  liquidityRate: bigint
  variableBorrowRate: bigint
  aTokenAddress: Address
  variableDebtTokenAddress: Address
  configData: bigint
}

export async function fetchPooledMarkets(client: PublicClient): Promise<PooledMarket[]> {
  const reservesList = await client.readContract({
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'getReservesList',
  })

  if (!reservesList || reservesList.length === 0) return []

  const [metaResults, reserveResults] = await Promise.all([
    client.multicall({
      contracts: reservesList.flatMap((addr) => [
        { address: addr, abi: viemErc20Abi, functionName: 'symbol' as const },
        { address: addr, abi: viemErc20Abi, functionName: 'decimals' as const },
      ]),
    }),
    client.multicall({
      contracts: reservesList.map((addr) => ({
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: 'getReserveData' as const,
        args: [addr] as const,
      })),
    }),
  ])

  const reserves = parseReserves(reservesList, metaResults, reserveResults)

  const oracleAddress = await fetchAaveOracleAddress(client)
  const assetAddresses = reserves.map((r) => r.address)

  const [oraclePrices, supplyResults] = await Promise.all([
    client.readContract({
      address: oracleAddress,
      abi: aaveOracleAbi,
      functionName: 'getAssetsPrices',
      args: [assetAddresses],
    }) as Promise<bigint[]>,
    client.multicall({
      contracts: reserves.flatMap((r) => [
        { address: r.aTokenAddress, abi: viemErc20Abi, functionName: 'totalSupply' as const },
        { address: r.variableDebtTokenAddress, abi: viemErc20Abi, functionName: 'totalSupply' as const },
      ]),
      allowFailure: true,
    }),
  ])

  return reserves.map((r, i) => {
    const totalSupply = supplyResults[i * 2]?.status === 'success' ? (supplyResults[i * 2]!.result as bigint) : 0n
    const totalDebt = supplyResults[i * 2 + 1]?.status === 'success' ? (supplyResults[i * 2 + 1]!.result as bigint) : 0n
    const priceUSD = oraclePrices[i] ? Number(formatUnits(oraclePrices[i]!, AAVE_ORACLE_DECIMALS)) : 0

    const totalSupplyFormatted = Number(formatUnits(totalSupply, r.decimals))
    const utilization =
      totalSupplyFormatted > 0 ? (Number(formatUnits(totalDebt, r.decimals)) / totalSupplyFormatted) * 100 : 0

    return {
      address: r.address,
      type: 'pooled' as const,
      name: `Pooled ${r.symbol}`,
      assetSymbol: r.symbol,
      assetAddress: r.address,
      assetDecimals: r.decimals,
      priceUSD,
      market: 'HypurrFi Pooled',
      entity: 'HypurrFi',
      supplyAPY: rayRateToAPY(r.liquidityRate),
      borrowAPY: rayRateToAPY(r.variableBorrowRate),
      reserveFactor: decodeReserveFactor(r.configData),
      utilization,
      totalAssets: totalSupply.toString(),
      totalBorrows: totalDebt.toString(),
      totalAssetsUSD: 0,
      totalBorrowsUSD: 0,
      supplyCap: decodeSupplyCapRaw(r.configData, r.decimals),
      borrowCap: decodeBorrowCapRaw(r.configData, r.decimals),
      maxLTV: decodeLTV(r.configData),
      liquidationThreshold: decodeLiquidationThreshold(r.configData),
      aTokenAddress: r.aTokenAddress,
    }
  })
}

// ── User position fetching ─────────────────────────────────────────

export async function fetchPooledUserPosition(
  client: PublicClient,
  userAddress: Address,
): Promise<PooledUserPosition | null> {
  try {
    const reservesList = await client.readContract({
      address: POOL_ADDRESS,
      abi: poolAbi,
      functionName: 'getReservesList',
    })

    if (!reservesList || reservesList.length === 0) return null

    const [accountData, reserveResults, metaResults] = await Promise.all([
      client.readContract({
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName: 'getUserAccountData',
        args: [userAddress],
      }),
      client.multicall({
        contracts: reservesList.map((addr) => ({
          address: POOL_ADDRESS,
          abi: poolAbi,
          functionName: 'getReserveData' as const,
          args: [addr] as const,
        })),
      }),
      client.multicall({
        contracts: reservesList.flatMap((addr) => [
          { address: addr, abi: viemErc20Abi, functionName: 'symbol' as const },
          { address: addr, abi: viemErc20Abi, functionName: 'decimals' as const },
        ]),
      }),
    ])

    const [totalCollateralBase, totalDebtBase, availableBorrowsBase, , ltv, healthFactor] = accountData as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ]

    const reserves = parseUserReserves(reservesList, metaResults, reserveResults)

    const oracleAddress = await fetchAaveOracleAddress(client)
    const [oraclePrices, balanceResults] = await Promise.all([
      client.readContract({
        address: oracleAddress,
        abi: aaveOracleAbi,
        functionName: 'getAssetsPrices',
        args: [reserves.map((r) => r.address)],
      }) as Promise<bigint[]>,
      client.multicall({
        contracts: reserves.flatMap((r) => [
          {
            address: r.aTokenAddress,
            abi: viemErc20Abi,
            functionName: 'balanceOf' as const,
            args: [userAddress] as const,
          },
          {
            address: r.variableDebtTokenAddress,
            abi: viemErc20Abi,
            functionName: 'balanceOf' as const,
            args: [userAddress] as const,
          },
        ]),
        allowFailure: true,
      }),
    ])

    for (let i = 0; i < reserves.length; i++) {
      if (oraclePrices[i]) {
        reserves[i]!.priceUSD = Number(formatUnits(oraclePrices[i]!, AAVE_ORACLE_DECIMALS))
      }
    }

    const { supplies, borrows } = buildUserAssetPositions(reserves, balanceResults)

    return {
      totalCollateralUSD: Number(formatUnits(totalCollateralBase, AAVE_ORACLE_DECIMALS)),
      totalBorrowUSD: Number(formatUnits(totalDebtBase, AAVE_ORACLE_DECIMALS)),
      availableBorrowsUSD: Number(formatUnits(availableBorrowsBase, AAVE_ORACLE_DECIMALS)),
      healthFactor: Number(formatUnits(healthFactor, DEFAULT_DECIMALS)),
      ltv: Number(ltv) / 100,
      supplies,
      borrows,
    }
  } catch {
    return null
  }
}

// ── Internal helpers ───────────────────────────────────────────────

async function fetchAaveOracleAddress(client: PublicClient): Promise<Address> {
  return (await client.readContract({
    address: POOL_ADDRESS_PROVIDER,
    abi: addressProviderAbi,
    functionName: 'getPriceOracle',
  })) as Address
}

function parseReserves(reservesList: readonly Address[], metaResults: any[], reserveResults: any[]): ReserveOnChain[] {
  const reserves: ReserveOnChain[] = []
  for (let i = 0; i < reservesList.length; i++) {
    const symbolRes = metaResults[i * 2]
    const decimalsRes = metaResults[i * 2 + 1]
    const reserveRes = reserveResults[i]

    if (symbolRes?.status !== 'success' || decimalsRes?.status !== 'success' || reserveRes?.status !== 'success') {
      continue
    }

    const data = reserveRes.result as {
      configuration: { data: bigint }
      currentLiquidityRate: bigint
      currentVariableBorrowRate: bigint
      aTokenAddress: Address
      variableDebtTokenAddress: Address
    }

    reserves.push({
      address: reservesList[i]!,
      symbol: symbolRes.result as string,
      decimals: decimalsRes.result as number,
      liquidityRate: data.currentLiquidityRate,
      variableBorrowRate: data.currentVariableBorrowRate,
      aTokenAddress: data.aTokenAddress,
      variableDebtTokenAddress: data.variableDebtTokenAddress,
      configData: data.configuration.data,
    })
  }
  return reserves
}

interface UserReserveInfo {
  address: Address
  symbol: string
  decimals: number
  aTokenAddress: Address
  variableDebtTokenAddress: Address
  supplyAPY: number
  borrowAPY: number
  priceUSD: number
}

function parseUserReserves(
  reservesList: readonly Address[],
  metaResults: any[],
  reserveResults: any[],
): UserReserveInfo[] {
  const reserves: UserReserveInfo[] = []
  for (let i = 0; i < reservesList.length; i++) {
    const symRes = metaResults[i * 2]
    const decRes = metaResults[i * 2 + 1]
    const resRes = reserveResults[i]

    if (symRes?.status !== 'success' || decRes?.status !== 'success' || resRes?.status !== 'success') continue

    const data = resRes.result as {
      currentLiquidityRate: bigint
      currentVariableBorrowRate: bigint
      aTokenAddress: Address
      variableDebtTokenAddress: Address
    }

    reserves.push({
      address: reservesList[i]!,
      symbol: symRes.result as string,
      decimals: decRes.result as number,
      aTokenAddress: data.aTokenAddress,
      variableDebtTokenAddress: data.variableDebtTokenAddress,
      supplyAPY: rayRateToAPY(data.currentLiquidityRate),
      borrowAPY: rayRateToAPY(data.currentVariableBorrowRate),
      priceUSD: 0,
    })
  }
  return reserves
}

function buildUserAssetPositions(
  reserves: UserReserveInfo[],
  balanceResults: any[],
): { supplies: PooledAssetPosition[]; borrows: PooledAssetPosition[] } {
  const supplies: PooledAssetPosition[] = []
  const borrows: PooledAssetPosition[] = []

  for (let i = 0; i < reserves.length; i++) {
    const r = reserves[i]!
    const supplyBal = balanceResults[i * 2]?.status === 'success' ? (balanceResults[i * 2]!.result as bigint) : 0n
    const debtBal = balanceResults[i * 2 + 1]?.status === 'success' ? (balanceResults[i * 2 + 1]!.result as bigint) : 0n

    if (supplyBal > 0n) {
      const amount = Number(formatUnits(supplyBal, r.decimals))
      supplies.push({
        assetAddress: r.address,
        assetSymbol: r.symbol,
        amount: amount.toString(),
        amountUSD: amount * r.priceUSD,
        apy: r.supplyAPY,
      })
    }
    if (debtBal > 0n) {
      const amount = Number(formatUnits(debtBal, r.decimals))
      borrows.push({
        assetAddress: r.address,
        assetSymbol: r.symbol,
        amount: amount.toString(),
        amountUSD: amount * r.priceUSD,
        apy: r.borrowAPY,
      })
    }
  }

  return { supplies, borrows }
}
