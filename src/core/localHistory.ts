import type { Hash } from 'viem';

import type { AppMode } from './forkGuard';

// Jenis riwayat spec (Supply/Withdraw/Borrow/Repay/…); withdraw dan lainnya menyusul di tiketnya. Approve/reset
// sengaja nggak dicatat: bukan jenis riwayat, dan nggak pernah punya pasangan di indexer saat digabung per txHash
// (tiket 22).
const KINDS = ['supply', 'borrow', 'repay'] as const;
const STATUSES = ['confirmed', 'failed'] as const;

/**
 * Tx yang dikirim dari app ini (spec "Riwayat": digabung dengan indexer di tiket 22, dedup per txHash). Jumlah
 * disimpan mentah (bigint sebagai string, biar bisa JSON); format di tampilan.
 */
export type LocalTxEntry = {
  hash: Hash;
  chainId: number;
  kind: (typeof KINDS)[number];
  /** `failed` = ada receipt revert (gas terpakai). */
  status: (typeof STATUSES)[number];
  /** Unix detik dari blok tx-nya, bukan `Date.now()`: waktu relatif dihitung terhadap waktu chain (Q30). */
  blockTimestamp: number;
  asset: { symbol: string; decimals: number; amount: string };
};

// Dipisah per mode + chain + wallet: fork dan mainnet sama-sama chain 1 (pola swap-web Q17).
export function localHistoryKey(mode: AppMode, chainId: number, wallet: string): string {
  return `lending-web:history:${mode}:${chainId}:${wallet.toLowerCase()}`;
}

/** Tx baru di depan; hash yang sudah ada diganti, bukan didobel. */
export function addEntry(entries: LocalTxEntry[], entry: LocalTxEntry): LocalTxEntry[] {
  return [entry, ...entries.filter((e) => e.hash !== entry.hash)];
}

// localStorage bisa kosong, rusak, atau berisi bentuk lama: yang nggak dikenal dibuang, halaman jangan sampai crash.
export function parseHistory(text: string | null): LocalTxEntry[] {
  if (text === null) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

function isEntry(value: unknown): value is LocalTxEntry {
  const e = value as Partial<LocalTxEntry> | null;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.hash === 'string' &&
    typeof e.chainId === 'number' &&
    KINDS.includes(e.kind as LocalTxEntry['kind']) &&
    STATUSES.includes(e.status as LocalTxEntry['status']) &&
    typeof e.blockTimestamp === 'number' &&
    typeof e.asset?.symbol === 'string' &&
    typeof e.asset.decimals === 'number' &&
    typeof e.asset.amount === 'string'
  );
}
