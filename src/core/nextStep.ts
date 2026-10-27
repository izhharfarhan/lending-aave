import { maxUint256 } from 'viem';

import type { Gate, RepayPlan } from './simulate';

/** Langkah yang dikirim ke wallet (ERC20 lewat Pool). */
export type WalletStepName = 'resetApproval' | 'approve' | 'supply' | 'borrow' | 'repay';

/** Bagian masukan yang khusus per tab aksi. */
export type ActionInput =
  | { action: 'supply' }
  | {
      action: 'borrow';
      /** Ada jaminan di chain ini. */
      hasCollateral: boolean;
      /** Tingkat konfirmasi #9 dari simulasi jumlah yang diisi. */
      gate: Gate;
      /** Pernyataan risiko dicentang (cuma berlaku untuk tier `check`). */
      riskChecked: boolean;
      /** "confirm" sudah diketik (cuma berlaku untuk tier `type`). */
      riskTyped: boolean;
    }
  /** `plan` = `repayPlan` untuk jumlah yang diisi; `null` kalau jumlah kosong. */
  | { action: 'repay'; plan: RepayPlan | null };

export type NextStepInput = {
  connected: boolean;
  /** Pengaman fork (tiket 01) belum aman: semua aksi transaksi dikunci. */
  txLocked: boolean;
  /** Data posisi chain ini. */
  data: 'loading' | 'error' | 'ready';
  txRunning: boolean;
  /** `null` = input kosong atau bukan jumlah yang valid. */
  amount: bigint | null;
  action: ActionInput;
  /** Saldo aset di wallet (supply/repay). */
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
  /** Borrow tanpa jaminan: "Supply jaminan dulu" membuka tab Supply (Q11). */
  | { step: 'needCollateral' }
  /** Melewati batas LTV: "Melebihi batas pinjam". */
  | { step: 'overLtv' }
  | { step: 'insufficientBalance' }
  | { step: 'confirmRisk'; gate: 'check' | 'type' }
  /** `approve(Pool, 0)` dulu: approve langsung bakal revert selama izin lama ≠ 0. */
  | { step: 'resetApproval' }
  | { step: 'approve'; amount: bigint }
  | { step: 'supply' }
  | { step: 'borrow' }
  | { step: 'repay' };

// Tombol utama dan langkah wallet berikutnya, dihitung dari state on-chain, bukan dari "langkah ke berapa" yang
// diingat UI (pola swap-web Q6). Urutan prioritas: spec "nextStep". Error wallet terakhir ditampilkan panel lewat
// status tx, jadi nggak ikut di sini.
export function nextStep(input: NextStepInput): NextStep {
  if (!input.connected) return { step: 'connect' };
  if (input.data === 'loading') return { step: 'loading' };
  if (input.data === 'error') return { step: 'loadFailed' };
  if (input.txRunning) return { step: 'busy' };
  if (input.txLocked) return { step: 'locked' };

  const { action } = input;
  if (action.action === 'borrow' && !action.hasCollateral) return { step: 'needCollateral' };
  const { amount, allowance } = input;
  if (amount === null) return { step: 'enterAmount' };

  if (action.action === 'borrow') {
    if (action.gate === 'locked') return { step: 'overLtv' };
    // Konfirmasi terikat pada tier-nya: centang untuk `check` nggak meloloskan `type` kalau tier naik (refetch / oracle).
    if (action.gate === 'check' && !action.riskChecked) return { step: 'confirmRisk', gate: 'check' };
    if (action.gate === 'type' && !action.riskTyped) return { step: 'confirmRisk', gate: 'type' };
    return { step: 'borrow' };
  }

  // Yang keluar dari wallet: repay lunas penuh = utang + bantalan bunga, selain itu jumlah yang diisi.
  const spend = action.action === 'repay' && action.plan ? action.plan.spend : amount;
  // Sebelum approve: approve cuma buang gas kalau transaksinya nggak mungkin jalan.
  if (spend > input.balance) return { step: 'insufficientBalance' };

  if (allowance < spend) {
    if (input.requiresApprovalReset && allowance > 0n) return { step: 'resetApproval' };
    return { step: 'approve', amount: input.approvalMode === 'unlimited' ? maxUint256 : spend };
  }
  return { step: action.action };
}
