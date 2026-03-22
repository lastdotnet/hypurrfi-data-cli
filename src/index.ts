import { Command } from 'commander'
import { config } from 'dotenv'
import { borrowCapacityCommand, cheapestBorrowCommand, leverageLoopCommand } from './commands/borrowing.js'
import { compareProtocolsCommand } from './commands/compare.js'
import { marketsCommand } from './commands/markets.js'
import { pricesCommand } from './commands/prices.js'
import { healthCheckCommand, liquidationPriceCommand, stressTestCommand } from './commands/risk.js'
import { strategiesCommand } from './commands/strategies.js'
import { userPositionsCommand } from './commands/user-positions.js'
import { earnStrategiesCommand, maximizeYieldCommand, optimizeYieldCommand } from './commands/yield.js'
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

function getAddress(address?: string): string {
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature requires bracket notation
  const defaultAddress = (program.opts()['address'] as string | undefined) ?? process.env['HYPURR_USER_ADDRESS']
  const resolved = address ?? defaultAddress
  if (!resolved) throw new Error('Wallet address required. Pass as argument, --address flag, or HYPURR_USER_ADDRESS env var.')
  return resolved
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
      await userPositionsCommand(getClient(), getAddress(address), getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('strategies')
  .description('List earn vault strategies with allocations and APYs')
  .option('-a, --asset <symbol>', 'Filter by vault asset (e.g. USDC, WHYPE)')
  .option('--vault <address>', 'Filter by vault address')
  .action(async (opts) => {
    try {
      await strategiesCommand(getClient(), opts, getFormat())
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

// ── Yield commands ──────────────────────────────────────────────────

program
  .command('maximize-yield')
  .description('Find highest risk-adjusted yield for a token across all protocols')
  .argument('<token>', 'Token symbol (e.g. USDC, WHYPE)')
  .action(async (token: string) => {
    try {
      await maximizeYieldCommand(getClient(), token, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('optimize-yield')
  .description('Analyze portfolio and suggest yield optimization moves')
  .argument('[address]', 'User wallet address (0x...)')
  .action(async (address?: string) => {
    try {
      await optimizeYieldCommand(getClient(), getAddress(address), getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('earn-strategies')
  .description('Show best curated earn vault strategies for a token')
  .argument('<token>', 'Token symbol (e.g. USDC)')
  .action(async (token: string) => {
    try {
      await earnStrategiesCommand(getClient(), token, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

// ── Borrowing commands ──────────────────────────────────────────────

program
  .command('cheapest-borrow')
  .description('Compare borrow APYs across all protocols for a token')
  .argument('<token>', 'Token symbol to borrow (e.g. USDC)')
  .action(async (token: string) => {
    try {
      await cheapestBorrowCommand(getClient(), token, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('borrow-capacity')
  .description('Calculate borrow capacity and recommend cheapest rates')
  .argument('[address]', 'User wallet address (0x...)')
  .requiredOption('--borrow-token <symbol>', 'Token to borrow')
  .requiredOption('--collateral-token <symbol>', 'Collateral token')
  .requiredOption('--target-ltv <ratio>', 'Target LTV ratio (e.g. 0.5 for 50%)')
  .action(async (address: string | undefined, opts: { borrowToken: string; collateralToken: string; targetLtv: string }) => {
    try {
      await borrowCapacityCommand(getClient(), getAddress(address), opts, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('leverage-loop')
  .description('Calculate net APY of looping a token at given leverage')
  .argument('<token>', 'Token symbol')
  .requiredOption('-l, --leverage <multiplier>', 'Leverage multiplier (e.g. 2, 3)')
  .action(async (token: string, opts: { leverage: string }) => {
    try {
      await leverageLoopCommand(getClient(), token, opts.leverage, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

// ── Risk commands ───────────────────────────────────────────────────

program
  .command('health-check')
  .description('Assess liquidation risk across all positions')
  .argument('[address]', 'User wallet address (0x...)')
  .action(async (address?: string) => {
    try {
      await healthCheckCommand(getClient(), getAddress(address), getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('liquidation-price')
  .description('Calculate price level that triggers liquidation per position')
  .argument('[address]', 'User wallet address (0x...)')
  .option('-t, --token <symbol>', 'Optional token filter')
  .action(async (address: string | undefined, opts: { token?: string }) => {
    try {
      await liquidationPriceCommand(getClient(), getAddress(address), opts, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program
  .command('stress-test')
  .description('Simulate price drop impact on health factors')
  .argument('[address]', 'User wallet address (0x...)')
  .requiredOption('-t, --token <symbol>', 'Token to simulate price drop for')
  .requiredOption('-d, --drop <percent>', 'Price drop percentage (e.g. 20 for 20%)')
  .action(async (address: string | undefined, opts: { token: string; drop: string }) => {
    try {
      await stressTestCommand(getClient(), getAddress(address), opts, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

// ── Comparison commands ─────────────────────────────────────────────

program
  .command('compare-protocols')
  .description('Side-by-side comparison of rates across protocols for a token')
  .argument('<token>', 'Token symbol (e.g. USDC)')
  .action(async (token: string) => {
    try {
      await compareProtocolsCommand(getClient(), token, getFormat())
    } catch (err) {
      console.error('Error:', err)
      process.exit(1)
    }
  })

program.parse()
