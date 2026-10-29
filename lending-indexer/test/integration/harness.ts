import pg from 'pg';
import { createPublicClient, createTestClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

import { INDEXED_CHAINS } from '../../src/chains';

// Dipakai globalSetup (menyalakan semuanya sekali) dan file test (memanggil Anvil, Ponder, DB-nya). Port khusus test:
// beda dari `anvil:up` lending-web (855x), fork test lending-web (1855x), swap-indexer (3854x), dan `dev:fork` (42070).
export const TEST_CHAINS = {
  1: { chain: mainnet, anvilPort: 48555, anvilArgs: [] },
  // Base tanpa riwayat state (`--prune-history 0`): meniru RPC non-archive, jadi HF blok −1 likuidasi di Base selalu
  // gagal dibaca dan jalur "tidak tersedia" (Q16) teruji. Baca di blok terbaru tetap jalan.
  8453: { chain: base, anvilPort: 48556, anvilArgs: ['--prune-history', '0'] },
  42161: { chain: arbitrum, anvilPort: 48557, anvilArgs: [] },
} as const;
export type TestChainId = keyof typeof TEST_CHAINS & keyof typeof INDEXED_CHAINS;

export const PONDER_PORT = 42170;
export const PONDER_URL = `http://127.0.0.1:${PONDER_PORT}`;
export const SCHEMA = 'lending_test';
// Sama dengan lending-web `src/config/testAccounts.json`: user tes (#0) dan akun kedua (#1). Delegasi EIP-7702 di
// chain asli dihapus di globalSetup (spec "Mode fork"). File test jalan berurutan, jadi satu akun aman dari tabrakan nonce.
export const TEST_ACCOUNT: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
export const OTHER_ACCOUNT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ROW_TIMEOUT_MS = 60_000;

// Jumlah USDC mentah (6 desimal) dan alamat huruf kecil seperti yang disimpan Ponder.
export const usdc = (n: number) => BigInt(n) * 1_000_000n;
export const lower = (address: Address) => address.toLowerCase();

export const anvilUrl = (chainId: TestChainId) => `http://127.0.0.1:${TEST_CHAINS[chainId].anvilPort}`;

export function testClients(chainId: TestChainId) {
  const { chain } = TEST_CHAINS[chainId];
  // Timeout 120 detik: fork dingin menarik tiap slot storage dari RPC archive dulu.
  const transport = http(anvilUrl(chainId), { timeout: 120_000 });
  return {
    publicClient: createPublicClient({ chain, transport, cacheTime: 0 }),
    walletClient: createWalletClient({ chain, account: TEST_ACCOUNT, transport }),
    testClient: createTestClient({ chain, mode: 'anvil', transport }),
  };
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} kosong; isi di .env.fork`);
  return value;
}

export async function waitFor(name: string, check: () => Promise<boolean>, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} belum siap dalam ${timeoutMs / 1000} detik`);
}

// Polling sampai Ponder menulis row-nya, dengan timeout supaya test nggak menggantung.
export async function waitForRows(db: pg.Client, txHash: Hex, count = 1, timeoutMs = ROW_TIMEOUT_MS) {
  let rows: Awaited<ReturnType<typeof selectRows>> = [];
  await waitFor(`Row position_event ${txHash}`, async () => {
    rows = await selectRows(db, txHash);
    return rows.length >= count;
  }, timeoutMs);
  // Row dobel = bug handler, bukan "belum muncul": dicek sesudah polling supaya pesannya jelas.
  if (rows.length > count) throw new Error(`${rows.length} row position_event untuk satu tx; harusnya ${count}`);
  return rows;
}

export async function selectRows(db: pg.Client, txHash: Hex) {
  const { rows } = await db.query(`SELECT * FROM ${SCHEMA}.position_event WHERE tx_hash = $1 ORDER BY log_index`, [txHash]);
  return rows;
}

export async function connectTestDb(url: string) {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  return db;
}

export async function graphql<T>(query: string, variables: Record<string, unknown>) {
  const res = await fetch(`${PONDER_URL}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`/graphql ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return (await res.json()) as { errors?: unknown; data: T };
}
