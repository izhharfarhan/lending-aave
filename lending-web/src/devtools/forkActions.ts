import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  keccak256,
  maxUint256,
  pad,
  parseAbi,
  parseEther,
  sliceHex,
  toBytes,
  toHex,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ContractFunctionParameters,
  type PublicClient,
  type TestClient,
} from 'viem';

import { poolAbi } from '@/aave/abis';
import { withGasMargin } from '@/core/gasMargin';

// Aksi Dev Tools ke Anvil (tiket 17, fork saja). Dipanggil panel Dev Tools di browser dan test fork, jadi cuma butuh
// client viem biasa ke RPC Anvil chain itu.
export type ForkActionClients = { publicClient: PublicClient; testClient: TestClient };

/** Tombol maju waktu (spec "Mode fork & Dev Tools"), dalam detik. */
export const TIME_STEPS = { day: 86_400, month: 30 * 86_400, year: 365 * 86_400 } as const;
export type TimeStep = keyof typeof TIME_STEPS;

/** Majukan jam chain lalu tambang satu blok, supaya bunga dan HF dihitung sampai jam baru (`blockTimestamp`). */
export async function advanceTime({ testClient }: ForkActionClients, seconds: number) {
  await testClient.increaseTime({ seconds });
  await testClient.mine({ blocks: 1 });
}

/**
 * Tambah saldo wallet. ETH lewat `anvil_setBalance`; ERC20 lewat `anvil_dealERC20` (Anvil mencari slot saldonya
 * sendiri), jadi token apa pun bisa tanpa holder. Keduanya *mengatur* saldo, jadi saldo lama dibaca dulu lalu ditambah.
 */
export async function faucet(
  { publicClient, testClient }: ForkActionClients,
  { account, asset, amount }: { account: Address; asset: Address | 'native'; amount: bigint },
) {
  if (asset === 'native') {
    const balance = await publicClient.getBalance({ address: account });
    await testClient.setBalance({ address: account, value: balance + amount });
    return;
  }
  const balance = await publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [account] });
  // Belum ada action viem untuk method ini.
  await testClient.request({ method: 'anvil_dealERC20', params: [account, asset, toHex(balance + amount)] } as never);
}

type Writable = 'nonpayable' | 'payable';
type Call<abi extends Abi, name extends ContractFunctionName<abi, Writable>> = ContractFunctionParameters<abi, Writable, name, ContractFunctionArgs<abi, Writable, name>>;
const GAS_TOP_UP = parseEther('1');

/**
 * Kirim `call` atas nama `from` (Anvil, tanpa tanda tangan). Gas limit = estimasi + margin seperti app (tanpa itu tx
 * bisa kehabisan gas di fork, mis. keluar dari E-Mode); estimasi yang revert sekaligus membawa error kontrak ber-nama
 * (`aaveErrorName`). Sengaja nggak lewat `simulateContract`: viem gagal men-decode `approve` USDT yang nggak
 * mengembalikan apa-apa. `topUpGas`: akun bantu (admin, likuidator) ditambah ETH untuk gas kalau tinggal sedikit.
 */
async function sendFrom<const abi extends Abi, name extends ContractFunctionName<abi, Writable>>(
  { publicClient, testClient }: ForkActionClients,
  from: Address,
  call: Call<abi, name>,
  { topUpGas = false } = {},
) {
  if (topUpGas) {
    const balance = await publicClient.getBalance({ address: from });
    if (balance < GAS_TOP_UP / 10n) await testClient.setBalance({ address: from, value: balance + GAS_TOP_UP });
  }
  // Tipe `call` sudah dicek di parameter; viem nggak bisa mempersempit generik sampai ke dua action ini.
  const gas = withGasMargin(await publicClient.estimateContractGas({ ...call, account: from } as never));
  const hash = await testClient.sendUnsignedTransaction({ from, to: call.address, data: encodeFunctionData(call as never), gas });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${call.functionName} gagal di jaringan`);
}

// App ini read-only untuk E-Mode (V4); setter-nya cuma ada di Dev Tools. Error Pool ikut supaya revert-nya terbaca.
const setUserEModeAbi = [...poolAbi, ...parseAbi(['function setUserEMode(uint8 categoryId)'])];

/** Masukkan akun ke kategori E-Mode (0 = keluar), untuk mencoba baris E-Mode di browser (tiket 14). */
export async function setUserEMode(clients: ForkActionClients, { pool, account, categoryId }: { pool: Address; account: Address; categoryId: number }) {
  await sendFrom(clients, account, { address: pool, abi: setUserEModeAbi, functionName: 'setUserEMode', args: [categoryId] });
}

/**
 * Mock aggregator Chainlink (tiket 18, V7; satu-satunya kontrak buatan sendiri, spec "Kontrak"). Sumber, dikompilasi
 * solc 0.8.24 (optimizer 200, tanpa metadata):
 *
 *   contract MockAggregator {
 *     int256 public latestAnswer;      // slot 0: harga USD 8 desimal
 *     address public originalSource;   // slot 1: sumber asli aset ini, untuk "harga asli"
 *     function decimals() external pure returns (uint8) { return 8; }
 *   }
 *
 * AaveOracle cuma memanggil `latestAnswer()`. Kodenya dipasang lewat `anvil_setCode` dan isinya ditulis lewat
 * `anvil_setStorageAt`, jadi nggak ada tx deploy dan alamatnya tetap per aset (tetap ketemu sesudah reload).
 */
const MOCK_AGGREGATOR_RUNTIME =
  '0x6080604052348015600e575f80fd5b5060043610603a575f3560e01c8063313ce56714603e57806350d25bcd146052578063cb233aac146066575b5f80fd5b604051600881526020015b60405180910390f35b60595f5481565b6040519081526020016049565b6001546078906001600160a01b031681565b6040516001600160a01b039091168152602001604956';
const PRICE_SLOT = toHex(0, { size: 32 });
const ORIGINAL_SOURCE_SLOT = toHex(1, { size: 32 });
const oracleAbi = parseAbi([
  'function getSourceOfAsset(address asset) view returns (address)',
  'function setAssetSources(address[] assets, address[] sources)',
]);

/** Alamat mock untuk satu aset: sama di semua chain dan setiap sesi. */
export const mockAggregatorOf = (asset: Address): Address =>
  getAddress(sliceHex(keccak256(toBytes(`lending-web/mock-aggregator/${asset.toLowerCase()}`)), 12));

type OracleTarget = { oracle: Address; admin: Address; asset: Address };
const sourceOf = ({ publicClient }: ForkActionClients, { oracle, asset }: OracleTarget) =>
  publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: 'getSourceOfAsset', args: [asset] });
const setSource = (clients: ForkActionClients, { oracle, admin, asset }: OracleTarget, source: Address) =>
  sendFrom(clients, admin, { address: oracle, abi: oracleAbi, functionName: 'setAssetSources', args: [[asset], [source]] }, { topUpGas: true });

/**
 * Harga aset di oracle Aave fork (V7): `price` USD 8 desimal. Pertama kali: mock dipasang, sumber asli dicatat di
 * mock, lalu admin (`ACL_ADMIN`, punya POOL_ADMIN) mengarahkan oracle ke mock. Sesudahnya cukup menulis harga di mock.
 */
export async function setOraclePrice(clients: ForkActionClients, { price, ...target }: OracleTarget & { price: bigint }) {
  if (price <= 0n) throw new Error('Harga harus lebih dari 0');
  const mock = mockAggregatorOf(target.asset);
  const { testClient } = clients;
  await testClient.setStorageAt({ address: mock, index: PRICE_SLOT, value: toHex(price, { size: 32 }) });
  const current = await sourceOf(clients, target);
  if (current.toLowerCase() === mock.toLowerCase()) return;
  await testClient.setCode({ address: mock, bytecode: MOCK_AGGREGATOR_RUNTIME });
  await testClient.setStorageAt({ address: mock, index: ORIGINAL_SOURCE_SLOT, value: pad(current) });
  await setSource(clients, target, mock);
}

/** Kembalikan oracle ke sumber asli aset itu (dicatat di mock). Tanpa mock aktif = sudah harga asli. */
export async function resetOraclePrice(clients: ForkActionClients, target: OracleTarget) {
  const mock = mockAggregatorOf(target.asset);
  if ((await sourceOf(clients, target)).toLowerCase() !== mock.toLowerCase()) return;
  const stored = await clients.publicClient.getStorageAt({ address: mock, slot: ORIGINAL_SOURCE_SLOT });
  await setSource(clients, target, getAddress(sliceHex(stored!, 12)));
}

const liquidationAbi = [
  ...poolAbi,
  ...parseAbi(['function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken)']),
];

/**
 * Likuidasi posisi `user` dari akun `liquidator` (spec story 121): likuidator diisi token utang secukupnya (faucet),
 * approve ke Pool, lalu `liquidationCall` dengan `debtToCover` = max (Pool membatasinya dengan close factor). Jaminan
 * diterima sebagai token biasa (`receiveAToken` = false). `debtAmount` = utang user di aset itu sekarang.
 */
export async function liquidate(
  clients: ForkActionClients,
  { pool, liquidator, user, collateral, debt, debtAmount }: { pool: Address; liquidator: Address; user: Address; collateral: Address; debt: Address; debtAmount: bigint },
) {
  // Bunga terus berjalan sampai tx ditambang: bantalan 1%.
  const funding = debtAmount + debtAmount / 100n + 1n;
  await faucet(clients, { account: liquidator, asset: debt, amount: funding });
  const allowance = await clients.publicClient.readContract({ address: debt, abi: erc20Abi, functionName: 'allowance', args: [liquidator, pool] });
  if (allowance < funding) {
    const approve = (amount: bigint) =>
      sendFrom(clients, liquidator, { address: debt, abi: erc20Abi, functionName: 'approve', args: [pool, amount] }, { topUpGas: true });
    // Reset dulu kalau masih ada sisa izin: USDT menolak approve dari izin ≠ 0 ke nilai ≠ 0, token lain nggak keberatan.
    if (allowance > 0n) await approve(0n);
    await approve(maxUint256);
  }
  await sendFrom(
    clients,
    liquidator,
    { address: pool, abi: liquidationAbi, functionName: 'liquidationCall', args: [collateral, debt, user, maxUint256, false] },
    { topUpGas: true },
  );
}
