import type { Address, PublicClient } from 'viem'
import { fetchKnownTokenPrices, fetchTokenPrices } from '../fetchers/prices'
import { type OutputFormat, print, printCSV, success } from '../output'

interface PricesOptions {
  tokens?: string
}

export async function pricesCommand(
  client: PublicClient,
  opts: PricesOptions,
  format: OutputFormat = 'json',
): Promise<void> {
  let prices: Awaited<ReturnType<typeof fetchTokenPrices>>

  if (opts.tokens) {
    const addresses = opts.tokens.split(',').map((a) => a.trim() as Address)
    prices = await fetchTokenPrices(client, addresses)
  } else {
    prices = await fetchKnownTokenPrices(client)
  }

  prices.sort((a, b) => b.priceUSD - a.priceUSD)

  if (format === 'csv') {
    printCSV(prices.map((p) => ({ ...p })))
    return
  }

  print(
    success({
      count: prices.length,
      prices,
    }),
  )
}
