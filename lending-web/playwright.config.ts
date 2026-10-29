import { defineConfig, devices } from '@playwright/test';

// Tiket 24 (pola e2e swap-web): E2E ke build produksi app mode fork di :3300 (`pnpm e2e:serve`), yang menembak Anvil
// E2E sendiri (:28555, Ethereum saja; dinyalakan `e2e/globalSetup.ts`). `dev:fork`, `anvil:up`, dan indexer boleh tetap jalan:
// nggak ada port atau state yang dipakai bareng. Indexer nggak dipasang (riwayat cuma lokal).
const PORT = 3300;

export default defineConfig({
  testDir: './e2e',
  // Semua test berbagi Anvil yang sama (snapshot / revert per test), jadi satu-satu.
  workers: 1,
  fullyParallel: false,
  // Fork dingin menarik state dari RPC archive dulu.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  globalSetup: './e2e/globalSetup.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm e2e:serve',
    url: `http://127.0.0.1:${PORT}`,
    // Build lama dipakai lagi kalau `pnpm e2e:serve` sudah jalan di terminal lain. Sesudah mengubah kode app, restart
    // server itu: env & kode di-bake waktu build.
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
