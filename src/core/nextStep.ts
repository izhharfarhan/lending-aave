import { maxUint256 } from 'viem';

/** Langkah yang dikirim ke wallet. Tiket 03: supply ERC20 saja. */
export type WalletStepName = 'resetApproval' | 'approve' | 'supply';

export type NextStepInput = {
  connected: boolean;
  /** Pengaman fork (tiket 01) belum aman: semua aksi transaksi dikunci. */
  txLocked: boolean;
  /** Data posisi chain ini. */
  data: 'loading' | 'error' | 'ready';
  txRunning: boolean;
  /** `null` = input kosong atau bukan jumlah yang valid. */
  amount: bigint | null;
  /** Saldo aset di wallet. */
  balance: bigint;
  /** On-chain: `token.allowance(user, Pool)`, dibaca di blok yang sama dengan saldo. */
  allowance: bigint;
  /** Default exact; unlimited hanya kalau user memilih (#8, pola Q7 swap). */
  approvalMode: 'exact' | 'unlimited';
  /** Token yang menolak approve dari izin ≠ 0 ke nilai ≠ 0 (USDT Ethereum). */
  requiresApprovalReset: boolean;
};

export type NextStep =
  | { step: 'connect' }
  | { step: 'loading' }
  | { step: 'loadFailed' }
  | { step: 'locked' }
  | { step: 'busy' }
  | { step: 'enterAmount' }
  | { step: 'insufficientBalance' }
  /** `approve(Pool, 0)` dulu: approve langsung bakal revert selama izin lama ≠ 0. */
  | { step: 'resetApproval' }
  | { step: 'approve'; amount: bigint }
  | { step: 'supply' };

// Tombol utama dan langkah wallet berikutnya, dihitung dari state on-chain, bukan dari "langkah ke berapa" yang
// diingat UI (pola swap-web Q6). Urutan prioritas: spec "nextStep". Error wallet terakhir ditampilkan panel lewat
// status tx, jadi nggak ikut di sini.
export function nextStep(input: NextStepInput): NextStep {
  if (!input.connected) return { step: 'connect' };
  if (input.data === 'loading') return { step: 'loading' };
  if (input.data === 'error') return { step: 'loadFailed' };
  if (input.txRunning) return { step: 'busy' };
  if (input.txLocked) return { step: 'locked' };

  const { amount, allowance } = input;
  if (amount === null) return { step: 'enterAmount' };
  // Sebelum approve: approve cuma buang gas kalau supply-nya nggak mungkin jalan.
  if (amount > input.balance) return { step: 'insufficientBalance' };

  if (allowance < amount) {
    if (input.requiresApprovalReset && allowance > 0n) return { step: 'resetApproval' };
    return { step: 'approve', amount: input.approvalMode === 'unlimited' ? maxUint256 : amount };
  }
  return { step: 'supply' };
}
