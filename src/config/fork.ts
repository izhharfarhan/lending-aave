import forkChains from './forkChains.json' with { type: 'json' };
import testAccounts from './testAccounts.json' with { type: 'json' };
import type { Address } from 'viem';

// forkChains.json & testAccounts.json juga dibaca `scripts/anvil-up.mjs`, jadi Anvil dan app selalu sepakat
// soal blok pin, port, dan akun tes yang dibersihkan dari delegasi EIP-7702.
type ForkChain = { forkBlock: number; port: number };
const chains: Record<string, ForkChain> = forkChains;

export const TEST_ACCOUNTS = testAccounts as { user: Address; liquidator: Address };

export function forkBlock(chainId: number): bigint {
  return BigInt(chains[chainId].forkBlock);
}

export function forkRpcUrl(chainId: number): string {
  return `http://127.0.0.1:${chains[chainId].port}`;
}
