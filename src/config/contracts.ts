import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type { Address } from 'viem';

// Semua alamat Aave dari @bgd-labs/aave-address-book (DECISIONS.md Q9, V6); mode fork = alamat mainnet.
// Jangan ditulis tangan: tanda "alamat resmi Aave" di UI bersandar pada sumber ini.
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

export const AAVE: Record<number, AaveContracts> = {
  1: {
    pool: AaveV3Ethereum.POOL,
    poolAddressesProvider: AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
    wrappedTokenGateway: AaveV3Ethereum.WETH_GATEWAY,
    aWeth: AaveV3Ethereum.ASSETS.WETH.A_TOKEN,
    variableDebtWeth: AaveV3Ethereum.ASSETS.WETH.V_TOKEN,
    uiPoolDataProvider: AaveV3Ethereum.UI_POOL_DATA_PROVIDER,
    oracle: AaveV3Ethereum.ORACLE,
    aclAdmin: AaveV3Ethereum.ACL_ADMIN,
  },
};
