import type { Address, PublicClient } from 'viem'
import { fetchKnownTokenPrices, fetchTokenPrices } from '../fetchers/prices.js'
import { type OutputFormat, print, printCSV, success } from '../output.js'

export interface PricesOptions {
  tokens?: string | undefined
}

export async function fetchPricesData(client: PublicClient, opts: PricesOptions) {
  let prices: Awaited<ReturnType<typeof fetchTokenPrices>>

  if (opts.tokens) {
    const addresses = opts.tokens.split(',').map((a) => a.trim() as Address)
    prices = await fetchTokenPrices(client, addresses)
  } else {
    prices = await fetchKnownTokenPrices(client)
  }

  prices.sort((a, b) => b.priceUSD - a.priceUSD)

  return { count: prices.length, prices }
}

export async function pricesCommand(
  client: PublicClient,
  opts: PricesOptions,
  format: OutputFormat = 'json',
): Promise<void> {
  const data = await fetchPricesData(client, opts)

  if (format === 'csv') {
    printCSV(data.prices.map((p) => ({ ...p })))
    return
  }

  print(success(data))
}
