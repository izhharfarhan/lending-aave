import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type { Address } from 'viem';

// Semua alamat Aave dari @bgd-labs/aave-address-book (DECISIONS.md Q9, V6); mode fork = alamat mainnet.
// Jangan ditulis tangan: tanda "alamat resmi Aave" di UI bersandar pada sumber ini.
export type AaveContracts = {
  pool: Address;
  wrappedTokenGateway: Address;
  uiPoolDataProvider: Address;
  oracle: Address;
  /** Pemegang POOL_ADMIN; dipakai Dev Tools fork untuk ganti sumber harga oracle (V7). */
  aclAdmin: Address;
};

export const AAVE: Record<number, AaveContracts> = {
  1: {
    pool: AaveV3Ethereum.POOL,
    wrappedTokenGateway: AaveV3Ethereum.WETH_GATEWAY,
    uiPoolDataProvider: AaveV3Ethereum.UI_POOL_DATA_PROVIDER,
    oracle: AaveV3Ethereum.ORACLE,
    aclAdmin: AaveV3Ethereum.ACL_ADMIN,
  },
};
