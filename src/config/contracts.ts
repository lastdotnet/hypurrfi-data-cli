import type { Address } from 'viem'

// Pooled lending
export const POOL_ADDRESS: Address = '0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b'
export const POOL_ADDRESS_PROVIDER: Address = '0xA73ff12D177D8F1Ec938c3ba0e87D33524dD5594'

// Mewler unit of account (chain-id 840 = 0x348 as address)
export const MEWLER_USD_UNIT_OF_ACCOUNT: Address = '0x0000000000000000000000000000000000000348'

// Mewler Vault Connector
export const EVC_ADDRESS: Address = '0xceAA7cdCD7dDBee8601127a9Abb17A974d613db4'

// Isolated pair registry
export const ISOLATED_REGISTRY_ADDRESS: Address = '0x5aB54F5Ca61ab60E81079c95280AF1Ee864EA3e7'

// Mewler Perspective Addresses (chain 999)
export const PERSPECTIVES = {
  escrowedCollateral: '0xaDaDF50246512dBA23889A1eC44611B191dfF6Fc' as Address,
  governed: '0x4936Cd82936b6862fDD66CC8c36e1828127a6b57' as Address,
  evkFactory: '0x7bd1DADB012651606cE70210c9d4d4c94e2480a3' as Address,
  edgeFactory: '0xd15E7cD7875C77E4fA448F72476A93D409dbc033' as Address,
  mewlerEarnFactory: '0x455Dcb38c4969f35F698115544eA4108392c79ad' as Address,
  mewlerEarnGoverned: '0x7b27dED9344D9c66FeAF58D151b52d1359aeA807' as Address,
}

/**
 * Curator entity registry — maps governor/curator wallet addresses to entity names.
 * When new curators are onboarded, add their addresses here.
 */
const CURATOR_ENTITIES: Record<string, string> = {
  '0x65a067b5955f11f6202f14c3b9cd64830c4170fb': 'Clearstar', // Governor
  '0x30988479c2e6a03e7fb65138b94762d41a733458': 'Clearstar', // Curator Wallet 1 (ForDeFi MPC)
  '0x72882eb5d27c7088dfa6dde941dd42e5d184f0ef': 'Clearstar', // Curator Wallet 2 (ForDeFi MPC)
}

/**
 * Product vault registries — vault addresses per product cluster.
 * On-chain vault names (e.g. "EVK Vault ehwHYPE-2") don't indicate the product,
 * so we maintain explicit address sets from the frontend products config.
 */
const PRIME_VAULTS = new Set([
  '0xf73c654d468f5485bf15f3470b78851a49257704', // WHYPE
  '0x443100d1149d6d925edb044248bbe32c5c7ae955', // kHYPE
  '0x8a4545827df5446ba120b904e5306e58acca4e89', // UBTC
  '0xc200aab602cd7046389b5c8fb088884323f8dd0f', // USDC
  '0x28fca2611d1dd8109c26f748cd2cf3bb4fc6d2cd', // USDT0
  '0x83c34784e355ad2670db77623b845273844fa480', // USDH
])

const YIELD_VAULTS = new Set([
  '0xc7e7861352df6919e7152c007832c48a777f2a4c', // WHYPE
  '0x97d30b40048ba3fc6b6628ce5e02e77f35b64fe0', // kHYPE
  '0x3403176f548400772c39e64564f2b148bcdfb65e', // PT-kHYPE
  '0x64a3052570f5a1c241c6c8cd32f8f9ad411e6990', // wstHYPE
  '0x1739105522e4fc9675f857c859223d24dfe7593c', // lstHYPE
  '0xcaaa9a6e543b9af588dce91e6c35cb5fa1c7734c', // beHYPE
  '0x61cb3b093b7125d593ccfa135c6e4e9d52d2e697', // UBTC
  '0x06bf901ce21450bab46cea74c4bb6f07e6859cd6', // UETH
  '0x09a6ad87eff280755bdf3e2c863358d27d81262d', // USDH
  '0x94f5c76a93f12057d73991ae5b4f70e9287b5b28', // USDT0
  '0xf9bb65e113418292d1a3555515fbd64637a0be18', // USDC
  '0xbb7dc37dbc108d40bcdd60403ef7bfdd6489071e', // hwHYPE
])

const EARN_VAULTS = new Set([
  '0xf38ea9de758a8f6be08b6e65bc0ff2f3e3ab741b', // purrUSDH
  '0xe8b10461ea0b04ff30f4cbfc3e93957cac00ded4', // purrHYPE (WHYPE underlying)
  '0x6dd448d5cb73dc96788d5be605dd3c5c83864a36', // purrUSDT0
  '0xf868a2b30854fe13e26f7ab7a92609ccb6b9c0e1', // purrUSDC
])

export interface MarketLabel {
  market: string
  entity: string
}

/**
 * Resolve the curator entity name from a governor or curator address.
 */
export function resolveEntity(address: string | null | undefined): string | null {
  if (!address) return null
  return CURATOR_ENTITIES[address.toLowerCase()] ?? null
}

/**
 * Resolve product name from vault address.
 */
export function resolveMarket(address: string): string | null {
  const lower = address.toLowerCase()
  if (PRIME_VAULTS.has(lower)) return 'HypurrFi Prime'
  if (YIELD_VAULTS.has(lower)) return 'HypurrFi Yield'
  if (EARN_VAULTS.has(lower)) return 'HypurrFi Earn'
  return null
}

/**
 * Determine mewler vault type from address: prime vaults → 'mewler-prime', others → 'mewler-yield'.
 */
export function resolveMewlerLendType(address: string): 'mewler-prime' | 'mewler-yield' {
  return PRIME_VAULTS.has(address.toLowerCase()) ? 'mewler-prime' : 'mewler-yield'
}
// Known token metadata
export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  // Native & HYPE derivatives
  '0x5555555555555555555555555555555555555555': { symbol: 'WHYPE', decimals: 18 },
  '0xfde5b0626fc80e36885e2fa9cd5ad9d7768d725c': { symbol: 'haHYPE', decimals: 18 },
  '0x94e8396e0869c9f2200760af0621afd240e1cf38': { symbol: 'wstHYPE', decimals: 18 },
  '0xfd739d4e423301ce9385c1fb8850539d657c296d': { symbol: 'kHYPE', decimals: 18 },
  '0xd8fc8f0b03eba61f64d08b0bef69d80916e5dda9': { symbol: 'beHYPE', decimals: 18 },
  '0x5748ae796ae46a4f1348a1693de4b50560485562': { symbol: 'LHYPE', decimals: 18 },
  '0xdabb040c428436d41cecd0fb06bcfdbaad3a9aa8': { symbol: 'mHYPE', decimals: 18 },
  '0x81e064d0eb539de7c3170edf38c1a42cbd752a76': { symbol: 'lstHYPE', decimals: 18 },
  '0x4de03ca1f02591b717495cfa19913ad56a2f5858': { symbol: 'hwHYPE', decimals: 18 },
  // Stablecoins
  '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb': { symbol: 'USD₮0', decimals: 6 },
  '0xb88339cb7199b77e23db6e890353e22632ba630f': { symbol: 'USDC', decimals: 6 },
  '0x111111a1a0667d36bd57c0a9f569b98057111111': { symbol: 'USDH', decimals: 6 },
  '0xb50a96253abdf803d85efcdce07ad8becbc52bd5': { symbol: 'USDHL', decimals: 6 },
  '0xca79db4b49f608ef54a5cb813fbed3a6387bc645': { symbol: 'USDXL', decimals: 18 },
  '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34': { symbol: 'USDe', decimals: 18 },
  '0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2': { symbol: 'sUSDe', decimals: 18 },
  '0x02c6a2fa58cc01a18b8d9e00ea48d65e4df26c70': { symbol: 'feUSD', decimals: 18 },
  // BTC & ETH derivatives
  '0x9fdbda0a5e284c32744d2f17ee5c74b284993463': { symbol: 'UBTC', decimals: 8 },
  '0xbe6727b535545c67d5caa73dea54865b92cf7907': { symbol: 'UETH', decimals: 18 },
  '0xe6829d9a7ee3040e1276fa75293bde931859e8fa': { symbol: 'cmETH', decimals: 18 },
  // Other tokens
  '0x9b498c3c8a0b8cd8ba1d9851d40d186f1872b44e': { symbol: 'PURR', decimals: 18 },
  '0xa320d9f65ec992eff38622c63627856382db726c': { symbol: 'HFUN', decimals: 18 },
  '0xf4d9235269a96aadafc9adae454a0618ebe37949': { symbol: 'XAUt0', decimals: 6 },
  '0xfdd22ce6d1f66bc0ec89b20bf16ccb6670f55a5a': { symbol: 'thBILL', decimals: 6 },
  '0x068f321fa8fb9f0d135f290ef6a3e2813e1c8a29': { symbol: 'USOL', decimals: 9 },
  '0x5e105266db42f78fa814322bce7f388b4c2e61eb': { symbol: 'hbUSDT', decimals: 18 },
  // LP & structured tokens
  '0x9fd7466f987fd4c45a5bbde22ed8aba5bc8d72d1': { symbol: 'hwHLP', decimals: 6 },
  '0x1359b05241ca5076c9f59605214f4f84114c0de8': { symbol: 'WHLP', decimals: 6 },
  '0x3d75f2bb8abcdbd1e27443cb5cbce8a668046c81': { symbol: 'HLP0', decimals: 6 },
  '0x47bb061c0204af921f43dc73c7d7768d2672ddee': { symbol: 'BUDDY', decimals: 6 },
  '0x27ec642013bcb3d80ca3706599d3cda04f6f4452': { symbol: 'UPUMP', decimals: 6 },
  // Pendle PT tokens
  '0x311db0fde558689550c68355783c95efdfe25329': { symbol: 'PT-kHYPE-13NOV2025', decimals: 18 },
  '0xea84ca9849d9e76a78b91f221f84e9ca065fc9f5': { symbol: 'PT-kHYPE-19MAR2026', decimals: 18 },
  '0x31cc92a2f8c02b8f9f427c48f12e21a848e69847': { symbol: 'PT-vkHYPE-13NOV2025', decimals: 18 },
  '0xfdf1704a7d60ab07d9889f33951633e7a80e34a3': { symbol: 'PT-HWHLP-18DEC2025', decimals: 6 },
}
