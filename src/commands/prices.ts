import type { Address, PublicClient } from 'viem'
import { fetchKnownTokenPrices, fetchTokenPrices } from '../fetchers/prices.js'
import { print, success } from '../output.js'

interface PricesOptions {
  tokens?: string
}

export async function pricesCommand(client: PublicClient, opts: PricesOptions): Promise<void> {
  let prices: Awaited<ReturnType<typeof fetchTokenPrices>>

  if (opts.tokens) {
    const addresses = opts.tokens.split(',').map((a) => a.trim() as Address)
    prices = await fetchTokenPrices(client, addresses)
  } else {
    prices = await fetchKnownTokenPrices(client)
  }

  // Sort by price descending
  prices.sort((a, b) => b.priceUSD - a.priceUSD)

  print(
    success({
      count: prices.length,
      prices,
    }),
  )
}
