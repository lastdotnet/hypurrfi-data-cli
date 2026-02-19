import { http, type Chain, createPublicClient } from 'viem'

export const DEFAULT_RPC_URL = 'https://rpc.hyperliquid.xyz/evm'

export const hyperEVM = {
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'Hype', symbol: 'HYPE', decimals: 18 },
  rpcUrls: {
    default: { http: [DEFAULT_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'HyperEVMScan', url: 'https://www.hyperevmscan.io' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11' as const,
    },
  },
} as const satisfies Chain

export const CHAIN_ID = 999

export function createClient(rpcUrl?: string) {
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket notation
  const url = rpcUrl ?? process.env['HYPEREVM_RPC_URL'] ?? DEFAULT_RPC_URL
  return createPublicClient({
    chain: hyperEVM,
    transport: http(url),
    batch: { multicall: true },
  })
}
