import { Command } from 'commander'
import { config } from 'dotenv'
import { marketsCommand } from './commands/markets.js'
import { pricesCommand } from './commands/prices.js'
import { userPositionsCommand } from './commands/user-positions.js'
import { createClient } from './config/chain.js'
import type { OutputFormat } from './output.js'

config({ debug: false })

const program = new Command()

program
  .name('hypurr-data')
  .description('HypurrFi lending protocol data API for agents — yields, borrows, positions, and prices on HyperEVM')
  .version('0.3.1')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--address <wallet>', 'Default user wallet address (fallback for user-positions)')
  .option('--format <format>', 'Output format: json (default) | csv', 'json')

function getClient() {
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket notation
  const rpc = program.opts()['rpc'] as string | undefined
  return createClient(rpc)
}

function getFormat(): OutputFormat {
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket notation
  const fmt = program.opts()['format'] as string | undefined
  return fmt === 'csv' ? 'csv' : 'json'
}

program
  .command('markets')
  .description('List lending markets across protocols with filtering and sorting')
  .option('-t, --type <type>', 'Filter by market type: pooled | mewler-prime | mewler-yield | mewler-earn | isolated')
  .option('-a, --asset <symbol>', 'Filter by asset symbol (e.g. USDC, WHYPE)')
  .option('--min-tvl <usd>', 'Minimum TVL in USD', '0')
  .option('-s, --sort <field>', 'Sort by: tvl (default) | supply-apy | borrow-apy', 'tvl')
  .option('-n, --limit <number>', 'Limit number of results')
  .action(async (opts) => {
    try {
      await marketsCommand(getClient(), opts, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('user-positions')
  .description('Show all positions for a user address across protocols (uses default address if omitted)')
  .argument('[address]', 'User wallet address (0x...)')
  .action(async (address?: string) => {
    try {
      // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket notation
      const defaultAddress = (program.opts()['address'] as string | undefined) ?? process.env['HYPURR_USER_ADDRESS']
      await userPositionsCommand(getClient(), address ?? defaultAddress ?? '', getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('prices')
  .description('Fetch token prices from Mewler oracle')
  .option('--tokens <addresses>', 'Comma-separated token addresses (defaults to known tokens)')
  .action(async (opts) => {
    try {
      await pricesCommand(getClient(), opts, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program.parse()
