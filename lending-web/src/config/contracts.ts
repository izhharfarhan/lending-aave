import type { Address } from 'viem';

import { SUPPORTED_CHAINS } from './chains';

// Alamat Aave per chain; sumbernya entri `SUPPORTED_CHAINS` (address-book, DECISIONS.md Q9, V6).
export type AaveContracts = {
  pool: Address;
  /** Argumen `provider` untuk semua fungsi UiPoolDataProviderV3. */
  poolAddressesProvider: Address;
  wrappedTokenGateway: Address;
  /** Token reserve WETH yang dipakai gateway: aWETH (izin withdraw ETH) dan variableDebtWETH (credit delegation borrow ETH). */
  aWeth: Address;
  variableDebtWeth: Address;
  uiPoolDataProvider: Address;
  oracle: Address;
  /** Pemegang POOL_ADMIN; dipakai Dev Tools fork untuk ganti sumber harga oracle (V7). */
  aclAdmin: Address;
};

export const AAVE: Record<number, AaveContracts> = Object.fromEntries(SUPPORTED_CHAINS.map((c) => [c.chainId, c.aave]));
