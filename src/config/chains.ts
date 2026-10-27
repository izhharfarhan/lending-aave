import { AaveV3Arbitrum, AaveV3Base, AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type { Address, Chain } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

import type { WhitelistAsset } from '@/core/chainPosition';
import type { AaveContracts } from './contracts';

/**
 * Semua yang beda per chain di app ini: menambah chain = menambah satu entri `SUPPORTED_CHAINS`. Di luar app masih ada
 * yang per chain: blok pin + port di forkChains.json, `NEXT_PUBLIC_RPC_URL_<id>` (Next cuma meng-inline nama env
 * literal, lihat wagmiConfig.ts) dan `ANVIL_FORK_URL_<id>` di .env, plus infrastruktur test fork (port, project Jest,
 * `globalSetup.<id>.ts`).
 */
export type SupportedChain = {
  chainId: number;
  /** Nilai `?chain=` di URL (Q5). */
  slug: string;
  name: string;
  viemChain: Chain;
  explorer: string;
  /**
   * Lantai cadangan gas MAX supply/repay ETH, wei (pola `maxSpendable` swap-web tiket 14: Ethereum 0,0005 ETH, L2
   * 0,00005 ETH). Gas mahal sudah ketutup `biaya × 2`.
   */
  minGasReserve: bigint;
  aave: AaveContracts;
  /**
   * Whitelist berbasis ALAMAT underlying (DECISIONS.md #3, V6), bukan simbol: simbol bisa kembar antar reserve (USDC
   * native vs USDC.e di Arbitrum, USDC vs USDbC di Base). Urutan = urutan baris tabel. Reserve di luar whitelist tampil
   * sebagai aset luar. Parameter reserve (LTV, LT, APY, flag) sengaja nggak di sini; semuanya dibaca dari kontrak.
   */
  whitelist: WhitelistAsset[];
};

// Bentuk address-book yang dipakai; semua alamat Aave dari @bgd-labs/aave-address-book (Q9, V6), jangan ditulis
// tangan: tanda "alamat resmi Aave" di UI bersandar pada sumber ini. Mode fork = alamat mainnet.
type AddressBook = {
  POOL: Address;
  POOL_ADDRESSES_PROVIDER: Address;
  WETH_GATEWAY: Address;
  UI_POOL_DATA_PROVIDER: Address;
  ORACLE: Address;
  ACL_ADMIN: Address;
  ASSETS: { WETH: { UNDERLYING: Address; A_TOKEN: Address; V_TOKEN: Address } };
};

const aaveOf = (book: AddressBook): AaveContracts => ({
  pool: book.POOL,
  poolAddressesProvider: book.POOL_ADDRESSES_PROVIDER,
  wrappedTokenGateway: book.WETH_GATEWAY,
  aWeth: book.ASSETS.WETH.A_TOKEN,
  variableDebtWeth: book.ASSETS.WETH.V_TOKEN,
  uiPoolDataProvider: book.UI_POOL_DATA_PROVIDER,
  oracle: book.ORACLE,
  aclAdmin: book.ACL_ADMIN,
});

// Reserve WETH tampil sebagai ETH: supply/withdraw/borrow/repay lewat WrappedTokenGateway (#6).
const eth = (book: AddressBook): WhitelistAsset => ({ address: book.ASSETS.WETH.UNDERLYING, symbol: 'ETH', native: true });

const L2_GAS_RESERVE = 50_000_000_000_000n;

export const SUPPORTED_CHAINS: SupportedChain[] = [
  {
    chainId: 1,
    slug: 'ethereum',
    name: 'Ethereum',
    viemChain: mainnet,
    explorer: 'https://etherscan.io',
    minGasReserve: 500_000_000_000_000n,
    aave: aaveOf(AaveV3Ethereum),
    whitelist: [
      eth(AaveV3Ethereum),
      { address: AaveV3Ethereum.ASSETS.USDC.UNDERLYING, symbol: 'USDC', native: false },
      // USDT Ethereum menolak approve dari izin ≠ 0 ke nilai ≠ 0.
      { address: AaveV3Ethereum.ASSETS.USDT.UNDERLYING, symbol: 'USDT', native: false, requiresApprovalReset: true },
    ],
  },
  {
    chainId: 8453,
    slug: 'base',
    name: 'Base',
    viemChain: base,
    explorer: 'https://basescan.org',
    minGasReserve: L2_GAS_RESERVE,
    aave: aaveOf(AaveV3Base),
    // Base tanpa USDT (V6). USDbC (USDC bridged lama) = aset luar.
    whitelist: [eth(AaveV3Base), { address: AaveV3Base.ASSETS.USDC.UNDERLYING, symbol: 'USDC', native: false }],
  },
  {
    chainId: 42161,
    slug: 'arbitrum',
    name: 'Arbitrum',
    viemChain: arbitrum,
    explorer: 'https://arbiscan.io',
    minGasReserve: L2_GAS_RESERVE,
    aave: aaveOf(AaveV3Arbitrum),
    whitelist: [
      eth(AaveV3Arbitrum),
      // USDC native (address-book: USDCn), tampil "USDC" (V6). USDC.e (address-book: USDC) = aset luar.
      { address: AaveV3Arbitrum.ASSETS.USDCn.UNDERLYING, symbol: 'USDC', native: false },
      // USD₮0: approve di atas sisa izin ≠ 0 lolos (dicek swap-web di fork), jadi tanpa reset.
      { address: AaveV3Arbitrum.ASSETS.USDT.UNDERLYING, symbol: 'USDT', native: false },
    ],
  },
];

export const DEFAULT_CHAIN = SUPPORTED_CHAINS[0];

export function supportedChain(chainId: number): SupportedChain {
  const chain = SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
  if (!chain) throw new Error(`Chain ${chainId} belum didukung`);
  return chain;
}

/** Chain terpilih dari `?chain=` (Q5); kosong atau nggak dikenal = Ethereum. */
export function chainFromParam(slug: string | null | undefined): SupportedChain {
  return SUPPORTED_CHAINS.find((c) => c.slug === slug) ?? DEFAULT_CHAIN;
}

export const minGasReserve = (chainId: number): bigint => supportedChain(chainId).minGasReserve;

export function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((c) => c.chainId === chainId)?.name ?? `chain ${chainId}`;
}
