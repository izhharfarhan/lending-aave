import type { Address } from 'viem';

import type { ChainRead, ChainView, WhitelistAsset } from './chainPosition';
import { nextStep, type ActionInput, type NextStep, type NextStepInput } from './nextStep';
import { repayPlan, simulate, type RepayPlan, type Simulation } from './simulate';

/** Tab panel aksi yang sudah punya transaksi (Withdraw menyusul di tiket 05). */
export type PanelTab = 'supply' | 'borrow' | 'repay';

/** Aset yang bisa dipilih di satu tab, dalam bentuk yang sama untuk ketiga tab. */
export type PanelAsset = {
  asset: Address;
  symbol: string;
  decimals: number;
  priceUsd: number;
  apy: number;
  /** `null` = belum connect, atau tab Borrow (nggak memakai saldo wallet). */
  walletBalance: bigint | null;
  allowance: bigint | null;
  requiresApprovalReset: boolean;
  /** Tab Borrow: sisa batas pinjam dalam token ini. */
  borrowable?: bigint | null;
  /** Tab Repay: utang sekarang dan APR pinjaman (ray) untuk bantalan bunga. */
  debt?: bigint;
  borrowRate?: bigint;
};

// ETH lewat gateway menyusul di tiket 06/07; aset luar read-only; reserve Dijeda menolak semua aksi (Dibekukan masih
// boleh repay).
export function panelAssets(view: ChainView, tab: PanelTab): PanelAsset[] {
  if (tab === 'supply') return view.supplyMarket.filter((r) => !r.native);
  if (tab === 'borrow') {
    return view.borrowMarket
      .filter((r) => !r.native)
      .map((r) => ({ ...r, walletBalance: null, allowance: null, requiresApprovalReset: false }));
  }
  return view.borrows
    .filter((r) => !r.native && !r.outside && r.status !== 'dijeda')
    .map((r) => ({ ...r, debt: r.amount }));
}

export type PanelInput = Pick<NextStepInput, 'connected' | 'txLocked' | 'txRunning' | 'approvalMode'> & {
  tab: PanelTab;
  asset: Address;
  /** `null` = input kosong atau bukan jumlah yang valid. */
  amount: bigint | null;
  /** Pernyataan risiko dicentang / "confirm" diketik; masing-masing cuma berlaku untuk tier-nya. */
  riskChecked: boolean;
  riskTyped: boolean;
};

export type PanelState = {
  step: NextStep;
  /** Posisi sesudah borrow/repay jumlah yang diisi; `null` untuk supply, jumlah kosong, atau belum connect. */
  sim: Simulation | null;
  /** Rencana repay untuk jumlah yang diisi; `null` di tab lain. */
  plan: RepayPlan | null;
};

/** Isi panel dari data satu chain: simulasi, rencana repay, lalu tombol utama lewat `nextStep`. */
export function evaluatePanel(read: ChainRead, view: ChainView, whitelist: WhitelistAsset[], input: PanelInput): PanelState {
  const { tab, amount } = input;
  const source = panelAssets(view, tab).find((r) => r.asset === input.asset);
  const plan =
    tab === 'repay' && source && amount !== null
      ? repayPlan({ debt: source.debt ?? 0n, balance: source.walletBalance ?? 0n, amount, variableBorrowRate: source.borrowRate ?? 0n })
      : null;
  const sim =
    source && amount !== null && tab !== 'supply' && read.user
      ? simulate(read, whitelist, { action: tab, asset: source.asset, amount: plan?.full ? plan.send : amount })
      : null;
  const action: ActionInput =
    tab === 'borrow'
      ? {
          action: 'borrow',
          hasCollateral: (view.account?.totalCollateralUsd ?? 0) > 0,
          gate: sim?.gate ?? 'none',
          riskChecked: input.riskChecked,
          riskTyped: input.riskTyped,
        }
      : tab === 'repay'
        ? { action: 'repay', plan }
        : { action: 'supply' };
  const step = nextStep({
    connected: input.connected,
    txLocked: input.txLocked,
    data: 'ready',
    txRunning: input.txRunning,
    amount,
    balance: source?.walletBalance ?? 0n,
    allowance: source?.allowance ?? 0n,
    approvalMode: input.approvalMode,
    requiresApprovalReset: source?.requiresApprovalReset ?? false,
    action,
  });
  return { step, sim, plan };
}
