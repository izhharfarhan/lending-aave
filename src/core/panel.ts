import type { Address } from 'viem';

import type { ChainRead, ChainView, WhitelistAsset } from './chainPosition';
import { nextStep, type ActionInput, type NextStep, type NextStepInput, type WalletStepName } from './nextStep';
import { repayPlan, simulate, withdrawPlan, type RepayPlan, type Simulation, type WithdrawPlan } from './simulate';

/** Tab panel aksi, plus mode toggle jaminan (dibuka dari switch di "Supply Anda", tanpa tab terpilih). */
export type PanelTab = 'supply' | 'withdraw' | 'borrow' | 'repay' | 'collateral';

/** Transaksi utama tiap tab. */
export const MAIN_STEP: Record<PanelTab, Exclude<WalletStepName, 'resetApproval' | 'approve'>> = {
  supply: 'supply',
  withdraw: 'withdraw',
  borrow: 'borrow',
  repay: 'repay',
  collateral: 'setCollateral',
};

/** Aset yang bisa dipilih di satu tab, dalam bentuk yang sama untuk semua tab. */
export type PanelAsset = {
  asset: Address;
  symbol: string;
  decimals: number;
  priceUsd: number;
  apy: number;
  /** `null` = belum connect, atau tab yang nggak memakai saldo wallet (borrow, withdraw, jaminan). */
  walletBalance: bigint | null;
  allowance: bigint | null;
  requiresApprovalReset: boolean;
  /** Reserve Dijeda: posisinya tetap bisa dibuka di panel, tapi semua aksi nonaktif dengan penjelasan. */
  paused: boolean;
  /** Tab Borrow: sisa batas pinjam dalam token ini. */
  borrowable?: bigint | null;
  /** Tab Repay: utang sekarang dan APR pinjaman (ray) untuk bantalan bunga. */
  debt?: bigint;
  borrowRate?: bigint;
  /** Tab Withdraw & jaminan: saldo supply, APR supply (ray), dan status jaminannya. */
  supplied?: bigint;
  supplyRate?: bigint;
  collateral?: boolean;
  canBeCollateral?: boolean;
};

// ETH lewat gateway menyusul di tiket 06/07 (toggle jaminan ETH tetap langsung ke Pool); aset luar read-only. Pasar
// supply/pinjam sudah tanpa reserve Dibekukan/Dijeda; posisi di reserve itu tetap bisa dibuka (Dibekukan masih boleh
// withdraw, repay, dan toggle jaminan; Dijeda ditolak `nextStep` dengan penjelasan).
export function panelAssets(view: ChainView, tab: PanelTab): PanelAsset[] {
  if (tab === 'supply') return view.supplyMarket.filter((r) => !r.native).map((r) => ({ ...r, paused: false }));
  if (tab === 'borrow') {
    return view.borrowMarket
      .filter((r) => !r.native)
      .map((r) => ({ ...r, walletBalance: null, allowance: null, requiresApprovalReset: false, paused: false }));
  }
  if (tab === 'repay') {
    return view.borrows
      .filter((r) => !r.native && !r.outside)
      .map((r) => ({ ...r, debt: r.amount, paused: r.status === 'dijeda' }));
  }
  return view.supplies
    .filter((r) => !r.outside && (tab === 'collateral' || !r.native))
    .map((r) => ({
      ...r,
      walletBalance: null,
      allowance: null,
      requiresApprovalReset: false,
      supplied: r.amount,
      paused: r.status === 'dijeda',
    }));
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
  /** Posisi sesudah aksi; `null` untuk supply, jumlah kosong, atau belum connect. */
  sim: Simulation | null;
  /** Rencana repay / withdraw untuk jumlah yang diisi; `null` di tab lain. */
  plan: RepayPlan | null;
  withdraw: WithdrawPlan | null;
};

/** Isi panel dari data satu chain: simulasi, rencana repay/withdraw, lalu tombol utama lewat `nextStep`. */
export function evaluatePanel(read: ChainRead, view: ChainView, whitelist: WhitelistAsset[], input: PanelInput): PanelState {
  const { tab, amount } = input;
  const source = panelAssets(view, tab).find((r) => r.asset === input.asset);
  const plan =
    tab === 'repay' && source && amount !== null
      ? repayPlan({ debt: source.debt ?? 0n, balance: source.walletBalance ?? 0n, amount, variableBorrowRate: source.borrowRate ?? 0n })
      : null;
  const withdraw =
    tab === 'withdraw' && source && amount !== null
      ? withdrawPlan({ supplied: source.supplied ?? 0n, amount, liquidityRate: source.supplyRate ?? 0n })
      : null;
  const sim = !source || !read.user ? null : simulateTab(read, whitelist, tab, source, amount, plan, withdraw);
  const risk = {
    gate: sim?.gate ?? 'none',
    ltvZero: sim?.ltvZero ?? false,
    riskChecked: input.riskChecked,
    riskTyped: input.riskTyped,
  };
  const action = ((): ActionInput => {
    switch (tab) {
      case 'supply':
        return { action: 'supply' };
      case 'borrow':
        return { action: 'borrow', hasCollateral: (view.account?.totalCollateralUsd ?? 0) > 0, ...risk };
      case 'repay':
        return { action: 'repay', plan };
      case 'withdraw':
        return { action: 'withdraw', plan: withdraw, ...risk };
      case 'collateral':
        return { action: 'collateral', enable: !source?.collateral, canEnable: source?.canBeCollateral ?? false, ...risk };
    }
  })();
  const step = nextStep({
    connected: input.connected,
    txLocked: input.txLocked,
    data: 'ready',
    txRunning: input.txRunning,
    paused: source?.paused ?? false,
    amount,
    balance: (tab === 'withdraw' ? source?.supplied : source?.walletBalance) ?? 0n,
    allowance: source?.allowance ?? 0n,
    approvalMode: input.approvalMode,
    requiresApprovalReset: source?.requiresApprovalReset ?? false,
    action,
  });
  return { step, sim, plan, withdraw };
}

function simulateTab(
  read: ChainRead,
  whitelist: WhitelistAsset[],
  tab: PanelTab,
  source: PanelAsset,
  amount: bigint | null,
  plan: RepayPlan | null,
  withdraw: WithdrawPlan | null,
): Simulation | null {
  const asset = source.asset;
  if (tab === 'collateral') return simulate(read, whitelist, { action: 'collateral', asset, enable: !source.collateral });
  if (tab === 'supply' || amount === null) return null;
  // Lunas penuh / withdraw semua dikirim sebagai uint256.max; simulasi memotongnya ke saldo/utang.
  const sent = plan?.full ? plan.send : withdraw?.all ? withdraw.send : amount;
  return simulate(read, whitelist, { action: tab, asset, amount: sent });
}
