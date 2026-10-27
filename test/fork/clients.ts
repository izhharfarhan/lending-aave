import { createPublicClient, createTestClient, createWalletClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import { forkBlock, TEST_ACCOUNTS } from '../../src/config/fork';

// Anvil khusus suite, dinyalakan globalSetup. Sengaja beda dari port `anvil:up` (8555, forkChains.json) dan dari
// test swap-web (1854x), biar test dan browser nggak saling ngotorin state.
export const FORK_TEST_PORT = 18555;
const rpcUrl = `http://127.0.0.1:${FORK_TEST_PORT}`;

// Akun user tes (Anvil yang sign), sama dengan connector fork di app.
export const TEST_ACCOUNT = TEST_ACCOUNTS.user;
export const PINNED_FORK_BLOCK = forkBlock(1);

// Timeout 120 detik (default viem 10): fork dingin narik tiap slot storage dari RPC archive dulu, dan request yang
// timeout tetap dikerjain Anvil, jadi request sesudahnya ikut timeout berantai (pola swap-web).
const transport = http(rpcUrl, { timeout: 120_000 });
export const FORK_RPC_URL = rpcUrl;
// cacheTime 0: tiap test nge-revert Anvil ke blok lebih awal, nomor blok cache viem bisa nunjuk blok yang sudah hilang.
export const publicClient = createPublicClient({ chain: mainnet, transport, cacheTime: 0 });
export const testClient = createTestClient({ chain: mainnet, mode: 'anvil', transport });
export const walletClient = createWalletClient({ chain: mainnet, account: TEST_ACCOUNT, transport });
