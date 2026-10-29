import forkChains from '../src/config/forkChains.json' with { type: 'json' };
import { createForkClients, type ForkClients, type ForkTestChainId } from '../test/fork/clients';

// Tiket 24: E2E punya Anvil sendiri di port `anvil:up` + 20000 (:28555 Ethereum), sama seperti test fork (:18555) yang
// nggak menumpang Anvil browser: E2E meninggalkan allowance & nonce, dan indexer `dev:fork` yang meng-index Anvil
// browser rusak kalau chain-nya di-revert. Offset yang sama ditulis di script `e2e:serve` (NEXT_PUBLIC_FORK_PORT_OFFSET)
// supaya app-nya menembak Anvil ini. Alur utama cuma di Ethereum; chain lain sudah dicakup test fork per chain.
const E2E_PORT_OFFSET = 20000;

export const E2E_CHAIN_IDS: ForkTestChainId[] = [1];

const clients = Object.fromEntries(
  E2E_CHAIN_IDS.map((id) => [id, createForkClients(id, forkChains[id].port + E2E_PORT_OFFSET)]),
) as Record<ForkTestChainId, ForkClients>;

export function e2eClients(chainId: ForkTestChainId): ForkClients {
  return clients[chainId];
}
