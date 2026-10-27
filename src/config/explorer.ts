import type { Address, Hash } from 'viem';

import { supportedChain } from './chains';

const explorerBase = (chainId: number): string => supportedChain(chainId).explorer;

// Alamat kontrak: mode fork pakai alamat mainnet (Q9), jadi tautannya tetap bisa dicocokkan user di explorer publik.
export function explorerAddressUrl(chainId: number, address: Address): string {
  return `${explorerBase(chainId)}/address/${address}`;
}

// Izin token milik user di chain itu. Mode fork memakai alamat mainnet, jadi yang tampil izin mainnet-nya.
export function revokeCashUrl(owner: Address, chainId: number): string {
  return `https://revoke.cash/address/${owner}?chainId=${chainId}`;
}

export function explorerTxUrl(chainId: number, hash: Hash): string {
  return `${explorerBase(chainId)}/tx/${hash}`;
}
