import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type { Address } from 'viem';

// Chain yang di-index (tiket 19: Ethereum; Base & Arbitrum di tiket 20). Alamat dari @bgd-labs/aave-address-book, sama
// dengan lending-web (DECISIONS Q9).
type IndexedChain = {
  /** Harus sama dengan blok pin Anvil lending-web (`src/config/forkChains.json`). */
  pinBlock: number;
  pool: Address;
};

export const INDEXED_CHAINS = {
  1: { pinBlock: 26_282_000, pool: AaveV3Ethereum.POOL },
} as const satisfies Record<number, IndexedChain>;

/**
 * Blok awal index mode fork (Q31): blok pin + 1. Blok sesudah pin dibuat Anvil sendiri, jadi `eth_getLogs`-nya nggak
 * kena batas 10 blok dan kuota RPC archive; riwayat sebelum pin memang kosong untuk akun tes.
 */
export const forkStartBlock = (chainId: keyof typeof INDEXED_CHAINS) => INDEXED_CHAINS[chainId].pinBlock + 1;
