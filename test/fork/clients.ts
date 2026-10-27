import { createPublicClient, createTestClient, createWalletClient, http } from 'viem';

import { supportedChain } from '../../src/config/chains';
import { forkBlock, TEST_ACCOUNTS } from '../../src/config/fork';

// Anvil khusus suite, satu per chain, dinyalakan globalSetup project chain itu (jest.fork.config.ts). Sengaja beda
// dari port `anvil:up` (forkChains.json) dan dari test swap-web (1854x), biar test dan browser nggak saling ngotorin.
const FORK_TEST_PORTS = { 1: 18555, 8453: 18556, 42161: 18557 } as const;
export type ForkTestChainId = keyof typeof FORK_TEST_PORTS;
const FORK_TEST_CHAIN_IDS = Object.keys(FORK_TEST_PORTS).map(Number) as ForkTestChainId[];

// Akun user tes (Anvil yang sign), sama dengan connector fork di app.
export const TEST_ACCOUNT = TEST_ACCOUNTS.user;

function createForkClients(chainId: ForkTestChainId) {
  const port = FORK_TEST_PORTS[chainId];
  const rpcUrl = `http://127.0.0.1:${port}`;
  const chain = supportedChain(chainId).viemChain;
  // Timeout 120 detik (default viem 10): fork dingin narik tiap slot storage dari RPC archive dulu, dan request yang
  // timeout tetap dikerjain Anvil, jadi request sesudahnya ikut timeout berantai (pola swap-web).
  const transport = http(rpcUrl, { timeout: 120_000 });
  return {
    chainId,
    port,
    rpcUrl,
    pinnedBlock: forkBlock(chainId),
    // cacheTime 0: tiap test nge-revert Anvil ke blok lebih awal, nomor blok cache viem bisa nunjuk blok yang hilang.
    publicClient: createPublicClient({ chain, transport, cacheTime: 0 }),
    testClient: createTestClient({ chain, mode: 'anvil', transport }),
    walletClient: createWalletClient({ chain, account: TEST_ACCOUNT, transport }),
  };
}
export type ForkClients = ReturnType<typeof createForkClients>;

const clientsByChain = Object.fromEntries(FORK_TEST_CHAIN_IDS.map((id) => [id, createForkClients(id)])) as Record<ForkTestChainId, ForkClients>;

/** Chain project Jest yang sedang jalan (`globals.forkChainId`, jest.fork.config.ts); `undefined` di luar test. */
export const projectChainId = () => (globalThis as { forkChainId?: number }).forkChainId;

/** Client Anvil test satu chain. Di dalam test cuma Anvil chain project-nya yang nyala (pola swap-web tiket 17b). */
export function forkClients(chainId: number): ForkClients {
  const clients = clientsByChain[chainId as ForkTestChainId];
  if (!clients) throw new Error(`Chain ${chainId} nggak punya Anvil test`);
  const projectChain = projectChainId();
  if (projectChain !== undefined && chainId !== projectChain) {
    throw new Error(`Spec project chain ${projectChain} memanggil chain ${chainId}; namai file-nya sesuai jest.fork.config.ts`);
  }
  return clients;
}

// Ethereum = chain matriks lengkap; spec Ethereum memakai ekspor ini.
export const { pinnedBlock: PINNED_FORK_BLOCK, publicClient, testClient, walletClient } = clientsByChain[1];
