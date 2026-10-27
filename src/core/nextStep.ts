import { maxUint256 } from 'viem';

import type { Gate, RepayPlan, WithdrawPlan } from './simulate';

/**
 * Langkah yang dikirim ke wallet. `approve` = ERC20 ke Pool, atau aWETH ke gateway (withdraw ETH); `delegate` = izin
 * gateway berutang atas nama user (`approveDelegation`, borrow ETH).
 */
export type WalletStepName = 'resetApproval' | 'approve' | 'delegate' | 'supply' | 'withdraw' | 'borrow' | 'repay' | 'setCollateral';

/** Hasil simulasi + konfirmasi user untuk aksi yang bisa memperburuk posisi (borrow, withdraw, mematikan jaminan). */
type RiskInput = {
  /** Tingkat konfirmasi #9 dari simulasi aksi ini. */
  gate: Gate;
  /** Aturan ltv0 kontrak menolak aksi ini (lihat `Simulation.ltvZero`). */
  ltvZero: boolean;
  /** Pernyataan risiko dicentang (cuma berlaku untuk tier `check`). */
  riskChecked: boolean;
  /** "confirm" sudah diketik (cuma berlaku untuk tier `type`). */
  riskTyped: boolean;
};

/** Bagian masukan yang khusus per tab aksi. */
export type ActionInput =
  | { action: 'supply' }
  | ({
      action: 'borrow';
      /** Ada jaminan di chain ini. */
      hasCollateral: boolean;
    } & RiskInput)
  /** `plan` = `repayPlan` untuk jumlah yang diisi; `null` kalau jumlah kosong. */
  | { action: 'repay'; plan: RepayPlan | null }
  /** `plan` = `withdrawPlan` untuk jumlah yang diisi; `NextStepInput.balance` diisi saldo supply. */
  | ({ action: 'withdraw'; plan: WithdrawPlan | null } & RiskInput)
  /** Toggle jaminan: tanpa jumlah. `canEnable` = LTV aset ≠ 0 (kontrak menolak menyalakan aset ber-LTV 0). */
  | ({ action: 'collateral'; enable: boolean; canEnable: boolean } & RiskInput);

export type NextStepInput = {
  connected: boolean;
  /** Pengaman fork (tiket 01) belum aman: semua aksi transaksi dikunci. */
  txLocked: boolean;
  /** Data posisi chain ini. */
  data: 'loading' | 'error' | 'ready';
  txRunning: boolean;
  /** Reserve aset ini Dijeda: semua aksi nonaktif sementara (spec 50). */
  paused: boolean;
  /** `null` = input kosong atau bukan jumlah yang valid. */
  amount: bigint | null;
  action: ActionInput;
  /** Saldo aset di wallet (supply/repay), atau saldo supply (withdraw). */
  balance: bigint;
  /**
   * Izin on-chain untuk aksi ini, dibaca di blok yang sama dengan saldo: ERC20 `allowance(user, Pool)`; withdraw ETH
   * `aWETH.allowance(user, gateway)`; borrow ETH `borrowAllowance(user, gateway)`. Supply/repay ETH nggak memakainya.
   */
  allowance: bigint;
  /** Default exact; unlimited hanya kalau user memilih (#8, pola Q7 swap). */
  approvalMode: 'exact' | 'unlimited';
  /** Token yang menolak approve dari izin ≠ 0 ke nilai ≠ 0 (USDT Ethereum). */
  requiresApprovalReset: boolean;
  /**
   * ETH lewat WrappedTokenGateway: supply/repay dikirim sebagai `value` tanpa approve (`balance` = saldo ETH); withdraw
   * butuh izin aWETH ke gateway, borrow butuh credit delegation ke gateway.
   */
  native: boolean;
};

export type NextStep =
  | { step: 'connect' }
  | { step: 'loading' }
  | { step: 'loadFailed' }
  | { step: 'locked' }
  | { step: 'busy' }
  | { step: 'paused' }
  | { step: 'enterAmount' }
  /** Borrow tanpa jaminan: "Supply jaminan dulu" membuka tab Supply (Q11). */
  | { step: 'needCollateral' }
  /** Melewati batas LTV: "Melebihi batas pinjam" / "Jaminan ini masih dibutuhkan". */
  | { step: 'overLtv' }
  /** Aturan ltv0: jaminan ber-LTV 0 harus ditarik/dimatikan dulu. */
  | { step: 'ltvZero' }
  /** Menyalakan jaminan aset ber-LTV 0. */
  | { step: 'cannotBeCollateral' }
  | { step: 'insufficientBalance' }
  | { step: 'confirmRisk'; gate: 'check' | 'type' }
  /** `approve(Pool, 0)` dulu: approve langsung bakal revert selama izin lama ≠ 0. */
  | { step: 'resetApproval' }
  | { step: 'approve'; amount: bigint }
  /** `approveDelegation(gateway, amount)` di variableDebtWETH: gateway boleh berutang ETH atas nama user. */
  | { step: 'delegate'; amount: bigint }
  | { step: 'supply' }
  | { step: 'withdraw' }
  | { step: 'borrow' }
  | { step: 'repay' }
  | { step: 'setCollateral' };

// Tombol utama dan langkah wallet berikutnya, dihitung dari state on-chain, bukan dari "langkah ke berapa" yang
// diingat UI (pola swap-web Q6). Urutan prioritas: spec "nextStep". Error wallet terakhir ditampilkan panel lewat
// status tx, jadi nggak ikut di sini.
export function nextStep(input: NextStepInput): NextStep {
  if (!input.connected) return { step: 'connect' };
  if (input.data === 'loading') return { step: 'loading' };
  if (input.data === 'error') return { step: 'loadFailed' };
  if (input.txRunning) return { step: 'busy' };
  if (input.paused) return { step: 'paused' };
  if (input.txLocked) return { step: 'locked' };

  const { action } = input;
  if (action.action === 'borrow' && !action.hasCollateral) return { step: 'needCollateral' };
  if (action.action === 'collateral') {
    if (action.enable && !action.canEnable) return { step: 'cannotBeCollateral' };
    return riskStep(action) ?? { step: 'setCollateral' };
  }
  const { amount, allowance } = input;
  if (amount === null) return { step: 'enterAmount' };

  if (action.action === 'borrow') {
    const risk = riskStep(action);
    if (risk) return risk;
    // Delegation selalu exact, abaikan approvalMode: delegation terbuka = pihak lain bisa berutang atas nama user.
    if (input.native && allowance < amount) return { step: 'delegate', amount };
    return { step: 'borrow' };
  }
  if (action.action === 'withdraw') {
    const blocked = lockStep(action);
    if (blocked) return blocked;
    if (amount > input.balance && !action.plan?.all) return { step: 'insufficientBalance' };
    const confirm = confirmStep(action);
    if (confirm) return confirm;
    // Withdraw semua ETH: izin aWETH berbantalan, karena gateway menarik saldo aWETH saat tx dieksekusi (V2, #8).
    const plan = action.plan;
    if (input.native && allowance < (plan ? plan.required : amount)) {
      return { step: 'approve', amount: permitAmount(input, plan ? plan.spend : amount) };
    }
    return { step: 'withdraw' };
  }

  // Yang keluar dari wallet: repay lunas penuh = utang + bantalan bunga, selain itu jumlah yang diisi.
  const plan = action.action === 'repay' ? action.plan : null;
  const spend = plan ? plan.spend : amount;
  // Sebelum approve: approve cuma buang gas kalau transaksinya nggak mungkin jalan.
  if (spend > input.balance) return { step: 'insufficientBalance' };

  if (!input.native && allowance < (plan ? plan.required : amount)) {
    if (input.requiresApprovalReset && allowance > 0n) return { step: 'resetApproval' };
    return { step: 'approve', amount: permitAmount(input, spend) };
  }
  return { step: action.action };
}

// Exact = yang dibutuhkan aksi ini; unlimited hanya kalau user memilih (#8). Berlaku juga untuk aWETH dan delegation.
const permitAmount = (input: NextStepInput, exact: bigint) => (input.approvalMode === 'unlimited' ? maxUint256 : exact);

// Urutan spec: kunci (melewati batas LTV, aturan ltv0) sebelum saldo, konfirmasi risiko sesudahnya.
function lockStep(risk: RiskInput): NextStep | null {
  if (risk.ltvZero) return { step: 'ltvZero' };
  if (risk.gate === 'locked') return { step: 'overLtv' };
  return null;
}

// Konfirmasi terikat pada tier-nya: centang untuk `check` nggak meloloskan `type` kalau tier naik (refetch / oracle).
function confirmStep(risk: RiskInput): NextStep | null {
  if (risk.gate === 'check' && !risk.riskChecked) return { step: 'confirmRisk', gate: 'check' };
  if (risk.gate === 'type' && !risk.riskTyped) return { step: 'confirmRisk', gate: 'type' };
  return null;
}

const riskStep = (risk: RiskInput) => lockStep(risk) ?? confirmStep(risk);
