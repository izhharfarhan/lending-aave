import type { WalletStepName } from './nextStep';

// DECISIONS.md Q10 (pola Q12 swap-web): biaya jaringan di panel = estimateGas atas calldata asli + L1 fee di Base.

/**
 * Batas atas gas tiap langkah, dikalibrasi dari `gasUsed` di fork Ethereum (networkFee.fork.spec.ts). Dipakai untuk
 * transaksi yang belum bisa diestimasi: transaksi utama sesudah izin revert di `eth_estimateGas` selama izinnya belum ada.
 * Terukur: approve ERC20/aWETH ≤ 55.570, delegate 53.714, supply ≤ 201.989, borrow ≤ 290.692, withdraw ≤ 316.941
 * (ETH, ada utang), repay ≤ 167.277, setCollateral ≤ 157.268.
 */
export const STEP_GAS: Record<WalletStepName, bigint> = {
  resetApproval: 60_000n,
  approve: 60_000n,
  delegate: 60_000n,
  supply: 220_000n,
  withdraw: 350_000n,
  borrow: 320_000n,
  repay: 185_000n,
  setCollateral: 175_000n,
};

/**
 * Gas satu aksi Aave yang tipikal, untuk badge "ETH kurang" di kartu chain: menutup approve + supply ERC20 (257.547) dan
 * borrow (≤ 290.692) yang terukur di fork (networkFee.fork.spec.ts).
 */
export const TYPICAL_ACTION_GAS = 300_000n;

/** Gas tiap langkah yang tersisa: langkah pertama dari `eth_estimateGas`, sisanya `STEP_GAS`. */
export function plannedGas(steps: WalletStepName[], firstEstimate: bigint): bigint[] {
  return steps.map((step, i) => (i === 0 ? firstEstimate : STEP_GAS[step]));
}

/** Satu transaksi dalam total biaya. `l1Fee` (wei) cuma di chain OP Stack (Base). */
export type FeeTx = { gas: bigint; l1Fee?: bigint };

export type NetworkFeeInput = {
  chainId: number;
  txs: FeeTx[];
  /** `baseFeePerGas` blok terakhir. */
  baseFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

// Yang ditampilkan = gas × (baseFee + priority fee) + L1 fee (OP Stack); `maxFeePerGas` cuma batas di tx. Chain OP
// Stack membayar L1 fee terpisah di luar gas (Base); Arbitrum nggak, L1-nya sudah di dalam gas.
const OP_STACK_CHAIN_IDS = new Set([8453]);
/** Chain yang tiap transaksinya membayar L1 fee terpisah; satu-satunya sumber untuk core dan adapter. */
export const isOpStack = (chainId: number) => OP_STACK_CHAIN_IDS.has(chainId);

export function networkFee(input: NetworkFeeInput): bigint {
  const pricePerGas = input.baseFeePerGas + input.maxPriorityFeePerGas;
  const opStack = isOpStack(input.chainId);

  return input.txs.reduce((total, tx) => {
    if (tx.gas < 0n) throw new RangeError(`Gas negatif: ${tx.gas}`);
    if (opStack && tx.l1Fee === undefined) throw new Error(`Chain ${input.chainId} butuh L1 fee per tx`);
    if (!opStack && tx.l1Fee !== undefined) throw new Error(`Chain ${input.chainId} nggak punya L1 fee terpisah`);
    return total + tx.gas * pricePerGas + (tx.l1Fee ?? 0n);
  }, 0n);
}

/** Perkiraan kasar biaya satu aksi Aave di sebuah chain (badge kartu chain, Q10): gasPrice × gas tipikal, tanpa L1 fee Base. */
export const typicalActionFee = (gasPrice: bigint) => gasPrice * TYPICAL_ACTION_GAS;
