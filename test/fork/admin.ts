import { erc20Abi, parseAbi, parseEther, type Address, type Hash } from 'viem';

import { poolAbi } from '../../src/aave/abis';
import { gasLimitFor } from '../../src/aave/gasLimit';
import type { WalletRequest } from '../../src/aave/poolTx';
import type { ReserveRead } from '../../src/core/chainPosition';
import { TEST_ACCOUNT, type ForkClients } from './clients';

type Clients = Pick<ForkClients, 'publicClient' | 'testClient' | 'walletClient'>;
/** Bagian address-book yang dipakai untuk aksi admin di fork. */
export type AdminBook = { ACL_ADMIN: Address; ACL_MANAGER: Address; POOL_CONFIGURATOR: Address };

/** Jalankan `send` sebagai `address` (Anvil impersonate, ETH diisi untuk gas), tunggu tx-nya sukses. */
export async function sendAs(clients: Clients, address: Address, send: () => Promise<Hash>) {
  await clients.testClient.impersonateAccount({ address });
  await clients.testClient.setBalance({ address, value: parseEther('1') });
  try {
    const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: await send() });
    expect(receipt.status).toBe('success');
  } finally {
    await clients.testClient.stopImpersonatingAccount({ address });
  }
}

const aclAbi = parseAbi(['function isPoolAdmin(address) view returns (bool)']);
const configuratorAbi = parseAbi([
  'function setSupplyCap(address asset, uint256 newSupplyCap)',
  'function setBorrowCap(address asset, uint256 newBorrowCap)',
  'function setReserveFreeze(address asset, bool freeze)',
]);
type ConfiguratorCall =
  | { functionName: 'setSupplyCap' | 'setBorrowCap'; args: [Address, bigint] }
  | { functionName: 'setReserveFreeze'; args: [Address, boolean] };

/**
 * Panggil PoolConfigurator sebagai pool admin (executor governance Aave). Dicek dulu lewat ACLManager: V7 baru
 * memastikan ACL_ADMIN = pool admin di Ethereum dan Base, jadi chain lain gagal dengan pesan jelas, bukan revert buta.
 */
export async function asPoolAdmin(clients: Clients, book: AdminBook, call: ConfiguratorCall) {
  const admin = book.ACL_ADMIN;
  const isPoolAdmin = await clients.publicClient.readContract({ address: book.ACL_MANAGER, abi: aclAbi, functionName: 'isPoolAdmin', args: [admin] });
  if (!isPoolAdmin) throw new Error(`ACL_ADMIN ${admin} bukan pool admin di chain ini; cari pemegang POOL_ADMIN lain`);
  await sendAs(clients, admin, () =>
    clients.walletClient.writeContract({ account: admin, address: book.POOL_CONFIGURATOR, abi: configuratorAbi, ...call } as never),
  );
}

/**
 * Siapkan posisi supply user tes di reserve yang sedang dihapus bertahap (mis. USDC.e Arbitrum, USDbC Base): Dibekukan
 * dan/atau kuota supply-nya sudah lewat. Sebentar dicairkan dan kuotanya dibuka (cap 0), supply langsung lewat Pool, lalu
 * keduanya dikembalikan; status reserve sesudahnya sama dengan sebelumnya.
 */
export async function supplyToReserve(
  clients: Clients,
  book: AdminBook,
  pool: Address,
  reserve: Pick<ReserveRead, 'underlyingAsset' | 'isFrozen' | 'supplyCap'>,
  amount: bigint,
) {
  const asset = reserve.underlyingAsset;
  if (reserve.isFrozen) await asPoolAdmin(clients, book, { functionName: 'setReserveFreeze', args: [asset, false] });
  if (reserve.supplyCap !== 0n) await asPoolAdmin(clients, book, { functionName: 'setSupplyCap', args: [asset, 0n] });
  // Gas limit = estimasi + margin seperti app (pola `sendWithMargin`): tanpa margin tx bisa revert diam-diam kehabisan gas,
  // dan estimasi yang revert menunjukkan alasan kontraknya (mis. cap, Dijeda) di pesan error.
  const send = async (request: WalletRequest) => {
    const gas = await gasLimitFor(clients.publicClient, request, TEST_ACCOUNT);
    const hash = await clients.walletClient.writeContract({ account: TEST_ACCOUNT, ...request, gas } as never);
    expect((await clients.publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
  };
  await send({ address: asset, abi: erc20Abi, functionName: 'approve', args: [pool, amount] });
  await send({ address: pool, abi: poolAbi, functionName: 'supply', args: [asset, amount, TEST_ACCOUNT, 0] });
  if (reserve.supplyCap !== 0n) await asPoolAdmin(clients, book, { functionName: 'setSupplyCap', args: [asset, reserve.supplyCap] });
  if (reserve.isFrozen) await asPoolAdmin(clients, book, { functionName: 'setReserveFreeze', args: [asset, true] });
}
