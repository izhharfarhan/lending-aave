import { defineConfig } from 'vitest/config';

// Pola swap-indexer: unit (fungsi murni src/core) + integrasi (Anvil + Ponder + DB sekali pakai).
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/core/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/integration/globalSetup.ts'],
          // Satu akun Anvil untuk semua file: berurutan supaya nonce-nya nggak tabrakan.
          fileParallelism: false,
          // Anvil + Ponder beneran: start Ponder dan menunggu row bisa puluhan detik di fork dingin.
          testTimeout: 180_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
