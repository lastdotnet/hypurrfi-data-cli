import type { Address, PublicClient } from 'viem'
import { formatUnits } from 'viem'
import { CHAIN_ID } from '../config/chain'
import { EULER_FEE_SCALE, LTV_BPS_DIVISOR } from '../config/constants'
import { resolveEntity, resolveMarket, resolveMewlerLendType } from '../config/contracts'
import { LENS_ADDRESSES, vaultLensAbi } from '../config/lens-abis'
import type { MewlerLendMarket, MewlerVaultLTVInfo, VaultLensInfo } from '../types'
import { discoverMewlerLendVaults } from '../utils/vault-discovery'

type MewlerLendType = 'mewler-prime' | 'mewler-yield'

interface VaultMeta {
  address: Address
  name: string
  type: MewlerLendType
}

interface ParsedLensVault {
  meta: VaultMeta
  data: VaultLensInfo
}

export async function fetchMewlerLendMarkets(client: PublicClient, _chainId = CHAIN_ID): Promise<MewlerLendMarket[]> {
  const vaultAddresses = await discoverMewlerLendVaults(client)
  if (vaultAddresses.length === 0) return []

  const lensCalls = vaultAddresses.map((addr) => ({
    address: LENS_ADDRESSES.vaultLens,
    abi: vaultLensAbi,
    functionName: 'getVaultInfoFull' as const,
    args: [addr] as const,
  }))

  const lensResults = await client.multicall({ contracts: lensCalls, allowFailure: true })

  const parsedVaults: ParsedLensVault[] = []

  for (let i = 0; i < vaultAddresses.length; i++) {
    const addr = vaultAddresses[i]!
    const res = lensResults[i]
    if (res?.status !== 'success') continue

    const vaultData = res.result as VaultLensInfo
    parsedVaults.push({
      meta: {
        address: addr,
        name: vaultData.vaultName ?? 'Unknown',
        type: resolveMewlerLendType(addr),
      },
      data: vaultData,
    })
  }

  if (parsedVaults.length === 0) return []

  const { borrowableByMap, collateralInMap } = buildVaultRelationships(parsedVaults)

  return parsedVaults.map((p) => buildMewlerMarket(p, borrowableByMap, collateralInMap))
}

// ── Vault relationship computation ─────────────────────────────────

function buildVaultRelationships(parsedVaults: ParsedLensVault[]) {
  const metaByAddress = new Map<string, VaultMeta>()
  const borrowableByMap = new Map<string, MewlerVaultLTVInfo[]>()
  const collateralInMap = new Map<string, MewlerVaultLTVInfo[]>()

  for (const p of parsedVaults) {
    const key = p.meta.address.toLowerCase()
    metaByAddress.set(key, p.meta)
    borrowableByMap.set(key, [])
    collateralInMap.set(key, [])
  }

  const nowTimestamp = BigInt(Math.floor(Date.now() / 1000))

  for (const debtVault of parsedVaults) {
    const debtKey = debtVault.meta.address.toLowerCase()
    const debtTotalBorrowed = BigInt(debtVault.data.totalBorrowed ?? 0n)

    for (const ltvInfo of debtVault.data.collateralLTVInfo ?? []) {
      if (!ltvInfo.collateral) continue

      const borrowLTVRaw = Number(ltvInfo.borrowLTV ?? 0n)
      const liquidationLTVRaw = Number(ltvInfo.liquidationLTV ?? 0n)
      const targetTimestamp = BigInt(ltvInfo.targetTimestamp ?? 0n)

      const collateralKey = ltvInfo.collateral.toLowerCase()
      const collateralMeta = metaByAddress.get(collateralKey)

      const isActive = liquidationLTVRaw > 0 || targetTimestamp > nowTimestamp
      if (isActive) {
        borrowableByMap.get(debtKey)?.push({
          vaultAddress: ltvInfo.collateral,
          vaultName: collateralMeta?.name ?? `Vault ${ltvInfo.collateral.slice(0, 10)}`,
          vaultType: collateralMeta?.type ?? 'mewler-yield',
          maxLTV: borrowLTVRaw / LTV_BPS_DIVISOR,
          liquidationThreshold: liquidationLTVRaw / LTV_BPS_DIVISOR,
        })
      }

      const isBorrowable =
        (borrowLTVRaw > 0 && liquidationLTVRaw > 0) ||
        targetTimestamp > nowTimestamp ||
        (debtTotalBorrowed > 0n && liquidationLTVRaw > 0)
      if (isBorrowable && collateralMeta) {
        collateralInMap.get(collateralKey)?.push({
          vaultAddress: debtVault.meta.address,
          vaultName: debtVault.meta.name,
          vaultType: debtVault.meta.type,
          maxLTV: borrowLTVRaw / LTV_BPS_DIVISOR,
          liquidationThreshold: liquidationLTVRaw / LTV_BPS_DIVISOR,
        })
      }
    }
  }

  return { borrowableByMap, collateralInMap }
}

// ── Market builder ─────────────────────────────────────────────────

function buildMewlerMarket(
  p: ParsedLensVault,
  borrowableByMap: Map<string, MewlerVaultLTVInfo[]>,
  collateralInMap: Map<string, MewlerVaultLTVInfo[]>,
): MewlerLendMarket {
  const v = p.data
  const assetDecimals = Number(v.assetDecimals)
  const unitOfAccountDecimals = Number(v.unitOfAccountDecimals)

  const rateInfo = v.irmInfo?.interestRateInfo?.[0]
  let supplyAPY = 0
  let borrowAPY = 0
  if (rateInfo && !v.irmInfo.queryFailure) {
    borrowAPY = Number(formatUnits(rateInfo.borrowAPY, 27)) * 100
    supplyAPY = Number(formatUnits(rateInfo.supplyAPY, 27)) * 100
  }

  let priceUSD = 0
  if (v.liabilityPriceInfo && !v.liabilityPriceInfo.queryFailure) {
    priceUSD = Number(formatUnits(v.liabilityPriceInfo.amountOutMid, unitOfAccountDecimals))
  }

  const totalAssetsNum = Number(formatUnits(v.totalAssets, assetDecimals))
  const utilization =
    totalAssetsNum > 0 ? (Number(formatUnits(v.totalBorrowed, assetDecimals)) / totalAssetsNum) * 100 : 0

  const key = p.meta.address.toLowerCase()
  const borrowableBy = borrowableByMap.get(key) ?? []
  const collateralIn = collateralInMap.get(key) ?? []

  return {
    address: p.meta.address,
    type: p.meta.type,
    name: p.meta.name,
    assetSymbol: v.assetSymbol,
    assetAddress: v.asset,
    assetDecimals,
    priceUSD,
    market: resolveMarket(p.meta.address),
    entity: resolveEntity(v.governorAdmin),
    supplyAPY,
    borrowAPY,
    interestFee: (Number(v.interestFee) / EULER_FEE_SCALE) * 100,
    utilization,
    totalAssets: v.totalAssets.toString(),
    totalBorrows: v.totalBorrowed.toString(),
    totalAssetsUSD: 0,
    totalBorrowsUSD: 0,
    supplyCap: v.supplyCap && v.supplyCap > 0n ? v.supplyCap.toString() : null,
    borrowCap: v.borrowCap && v.borrowCap > 0n ? v.borrowCap.toString() : null,
    canBeBorrowedByVaults: borrowableBy.length,
    canBeUsedAsCollateralByVaults: collateralIn.length,
    borrowableBy,
    collateralIn,
  }
}
