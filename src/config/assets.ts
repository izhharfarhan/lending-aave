import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';

import type { WhitelistAsset } from '@/core/chainPosition';

// Whitelist per chain berbasis ALAMAT underlying (DECISIONS.md #3, V6), bukan simbol: simbol bisa kembar antar
// reserve (mis. USDC vs USDC.e di Arbitrum). Urutan di sini = urutan baris di tabel. Parameter reserve (LTV, LT, APY,
// flag) sengaja nggak ada di sini; semuanya dibaca dari kontrak.
export const WHITELIST: Record<number, WhitelistAsset[]> = {
  1: [
    // Reserve WETH tampil sebagai ETH: supply/withdraw/borrow/repay lewat WrappedTokenGateway (#6).
    { address: AaveV3Ethereum.ASSETS.WETH.UNDERLYING, symbol: 'ETH', native: true },
    { address: AaveV3Ethereum.ASSETS.USDC.UNDERLYING, symbol: 'USDC', native: false },
    { address: AaveV3Ethereum.ASSETS.USDT.UNDERLYING, symbol: 'USDT', native: false, requiresApprovalReset: true },
  ],
};
