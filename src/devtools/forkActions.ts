import { encodeFunctionData, erc20Abi, parseAbi, toHex, type Address, type PublicClient, type TestClient } from 'viem';

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

// App ini read-only untuk E-Mode (V4); setter-nya cuma ada di Dev Tools. Error Pool ikut supaya revert-nya terbaca.
const setUserEModeAbi = [...poolAbi, ...parseAbi(['function setUserEMode(uint8 categoryId)'])];

/**
 * Masukkan akun ke kategori E-Mode (0 = keluar), untuk mencoba baris E-Mode di browser (tiket 14). Disimulasikan dulu
 * supaya penolakan Pool (mis. `InvalidDebtInEmode`) muncul sebagai error ber-nama, bukan tx gagal; lalu dikirim atas nama
 * akun itu (Anvil, tanpa tanda tangan) dengan gas limit estimasi + margin seperti app: tanpa itu keluar dari E-Mode
 * kehabisan gas di fork.
 */
export async function setUserEMode(
  { publicClient, testClient }: ForkActionClients,
  { pool, account, categoryId }: { pool: Address; account: Address; categoryId: number },
) {
  const call = { address: pool, abi: setUserEModeAbi, functionName: 'setUserEMode', args: [categoryId] } as const;
  await publicClient.simulateContract({ ...call, account });
  const gas = withGasMargin(await publicClient.estimateContractGas({ ...call, account }));
  const hash = await testClient.sendUnsignedTransaction({ from: account, to: pool, data: encodeFunctionData(call), gas });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`setUserEMode(${categoryId}) gagal di jaringan`);
}
