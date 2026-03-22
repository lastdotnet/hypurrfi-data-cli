import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/mcp/server.ts'],
    platform: 'node',
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/lib.ts'],
    platform: 'node',
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
  },
])
