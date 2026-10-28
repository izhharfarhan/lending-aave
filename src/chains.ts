import { AaveV3Arbitrum, AaveV3Base, AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type { Address } from 'viem';

// Chain yang di-index. Alamat dari @bgd-labs/aave-address-book, sama dengan lending-web (DECISIONS Q9, V6).
type IndexedChain = {
  /** Nama chain di config Ponder; juga kunci `_meta.status` di GraphQL. */
  name: string;
  /** Harus sama dengan blok pin Anvil lending-web (`src/config/forkChains.json`). */
  pinBlock: number;
  pool: Address;
  /** WrappedTokenGatewayV3: pemanggil Pool untuk aksi ETH (V2). */
  wethGateway: Address;
  /** aWETH: `Transfer` ke gateway membawa pemilik withdraw ETH (V2). */
  aWeth: Address;
};

export const INDEXED_CHAINS = {
  1: { name: 'mainnet', pinBlock: 26_282_000, pool: AaveV3Ethereum.POOL, wethGateway: AaveV3Ethereum.WETH_GATEWAY, aWeth: AaveV3Ethereum.ASSETS.WETH.A_TOKEN },
  8453: { name: 'base', pinBlock: 52_975_000, pool: AaveV3Base.POOL, wethGateway: AaveV3Base.WETH_GATEWAY, aWeth: AaveV3Base.ASSETS.WETH.A_TOKEN },
  42161: { name: 'arbitrum', pinBlock: 517_470_000, pool: AaveV3Arbitrum.POOL, wethGateway: AaveV3Arbitrum.WETH_GATEWAY, aWeth: AaveV3Arbitrum.ASSETS.WETH.A_TOKEN },
} as const satisfies Record<number, IndexedChain>;

export type IndexedChainId = keyof typeof INDEXED_CHAINS;

/**
 * Blok awal index mode fork (Q31): blok pin + 1. Blok sesudah pin dibuat Anvil sendiri, jadi `eth_getLogs`-nya nggak
 * kena batas 10 blok dan kuota RPC archive; riwayat sebelum pin memang kosong untuk akun tes.
 */
export const forkStartBlock = (chainId: IndexedChainId) => INDEXED_CHAINS[chainId].pinBlock + 1;
