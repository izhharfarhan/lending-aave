import type { Address } from 'viem';

import type { ChainRead, ChainView, WhitelistAsset } from './chainPosition';
import type { LocalTxEntry } from './localHistory';
import { nextStep, type ActionInput, type NextStep, type NextStepInput, type WalletStepName } from './nextStep';
import { repayPlan, simulate, withdrawPlan, type RepayPlan, type Simulation, type WithdrawPlan } from './simulate';

/** Tab panel aksi, plus mode toggle jaminan (dibuka dari switch di "Supply Anda", tanpa tab terpilih). */
export type PanelTab = 'supply' | 'withdraw' | 'borrow' | 'repay' | 'collateral';

/** Transaksi utama tab aksi (langkah wallet terakhir). */
export type MainStep = Exclude<WalletStepName, 'resetApproval' | 'approve'>;

type AssetBase = {
  asset: Address;
  symbol: string;
  decimals: number;
  priceUsd: number;
  apy: number;
  /** Reserve Dijeda: posisinya tetap bisa dibuka di panel, tapi semua aksi nonaktif dengan penjelasan. */
  paused: boolean;
  /** ETH (reserve WETH): lewat WrappedTokenGateway; toggle jaminan tetap langsung ke Pool. */
  native: boolean;
};
/** Aset yang keluar dari wallet lewat approve ke Pool. `null` = belum connect. */
type FromWallet = { walletBalance: bigint | null; allowance: bigint | null; requiresApprovalReset: boolean };

/** Aset yang bisa dipilih di satu tab; `tab` membedakan field yang dipakai tab itu. */
export type PanelAsset =
  | (AssetBase & FromWallet & { tab: 'supply' })
  /** `borrowable` = sisa batas pinjam dalam token ini; `allowance` = credit delegation ke gateway (ETH), `null` = belum connect / ERC20. */
  | (AssetBase & { tab: 'borrow'; borrowable: bigint | null; allowance: bigint | null })
  /** `borrowRate` = APR pinjaman (ray) untuk bantalan bunga repay penuh. */
  | (AssetBase & FromWallet & { tab: 'repay'; debt: bigint; borrowRate: bigint })
  /** `supplyRate` = APR supply (ray) untuk kelonggaran "withdraw semua"; `allowance` = izin aWETH ke gateway (ETH), `null` = ERC20. */
  | (AssetBase & { tab: 'withdraw'; supplied: bigint; supplyRate: bigint; collateral: boolean; allowance: bigint | null })
  | (AssetBase & { tab: 'collateral'; supplied: bigint; collateral: boolean; canBeCollateral: boolean });

type AssetOf<T extends PanelTab> = Extract<PanelAsset, { tab: T }>;

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
  repay: RepayPlan | null;
  withdraw: WithdrawPlan | null;
};

/** Yang disiapkan tiap tab untuk `nextStep`, selain bagian yang sama untuk semua tab. */
type Prepared = Pick<PanelState, 'sim' | 'repay' | 'withdraw'> &
  Pick<NextStepInput, 'action' | 'balance' | 'allowance' | 'requiresApprovalReset'>;

type Context = {
  read: ChainRead;
  view: ChainView;
  whitelist: WhitelistAsset[];
  amount: bigint | null;
  riskChecked: boolean;
  riskTyped: boolean;
};

type TabSpec<A extends PanelAsset> = {
  main: MainStep;
  /** Aset `native` (ETH) di tab ini lewat WrappedTokenGateway (bukan langsung ke Pool). */
  gateway: boolean;
  /** Aset yang bisa dipilih di tab ini, urut seperti tabelnya. */
  assets: (view: ChainView) => A[];
  prepare: (row: A, ctx: Context) => Prepared;
};

const noSim: Pick<Prepared, 'sim' | 'repay' | 'withdraw'> = { sim: null, repay: null, withdraw: null };
const noWallet = { balance: 0n, allowance: 0n, requiresApprovalReset: false };
const fromWallet = (row: FromWallet) => ({
  balance: row.walletBalance ?? 0n,
  allowance: row.allowance ?? 0n,
  requiresApprovalReset: row.requiresApprovalReset,
});
// Simulasi butuh posisi user; sebelum connect cuma daftar aset.
const simulateIf = (ctx: Context, run: (read: ChainRead) => Simulation) => (ctx.read.user ? run(ctx.read) : null);
const risk = (sim: Simulation | null, ctx: Context) => ({
  gate: sim?.gate ?? 'none',
  ltvZero: sim?.ltvZero ?? false,
  riskChecked: ctx.riskChecked,
  riskTyped: ctx.riskTyped,
});

// Semua yang beda per tab ada di sini. ETH: supply/withdraw/borrow/repay lewat gateway, toggle jaminan ETH langsung ke
// Pool; aset luar read-only. Pasar supply/pinjam sudah tanpa reserve Dibekukan/Dijeda; posisi di reserve itu tetap
// bisa dibuka (Dibekukan masih boleh withdraw, repay, dan toggle jaminan; Dijeda ditolak `nextStep` dengan penjelasan).
export const PANEL_TABS: { [T in PanelTab]: TabSpec<AssetOf<T>> } = {
  supply: {
    main: 'supply',
    gateway: true,
    assets: (view) => view.supplyMarket.map((r) => ({ ...r, tab: 'supply', paused: false })),
    prepare: (row) => ({ ...noSim, action: { action: 'supply' }, ...fromWallet(row) }),
  },
  borrow: {
    main: 'borrow',
    gateway: true,
    assets: (view) => view.borrowMarket.map((r) => ({ ...r, tab: 'borrow', paused: false })),
    prepare: (row, ctx) => {
      const { amount } = ctx;
      const sim =
        amount === null ? null : simulateIf(ctx, (read) => simulate(read, ctx.whitelist, { action: 'borrow', asset: row.asset, amount }));
      const hasCollateral = (ctx.view.account?.totalCollateralUsd ?? 0) > 0;
      // Borrow ETH: izin yang dibandingkan nextStep = credit delegation ke gateway.
      return { ...noSim, sim, action: { action: 'borrow', hasCollateral, ...risk(sim, ctx) }, ...noWallet, allowance: row.allowance ?? 0n };
    },
  },
  repay: {
    main: 'repay',
    gateway: true,
    assets: (view) =>
      view.borrows
        .filter((r) => !r.outside)
        .map((r) => ({ ...r, tab: 'repay', debt: r.amount, paused: r.status === 'dijeda' })),
    prepare: (row, ctx) => {
      const { amount } = ctx;
      if (amount === null) return { ...noSim, action: { action: 'repay', plan: null }, ...fromWallet(row) };
      const repay = repayPlan({ debt: row.debt, balance: row.walletBalance ?? 0n, amount, variableBorrowRate: row.borrowRate });
      // Lunas penuh dikirim sebagai uint256.max; simulasi memotongnya ke utang.
      const sent = repay.full ? repay.send : amount;
      const sim = simulateIf(ctx, (read) => simulate(read, ctx.whitelist, { action: 'repay', asset: row.asset, amount: sent }));
      return { sim, repay, withdraw: null, action: { action: 'repay', plan: repay }, ...fromWallet(row) };
    },
  },
  withdraw: {
    main: 'withdraw',
    gateway: true,
    assets: (view) =>
      view.supplies
        .filter((r) => !r.outside)
        .map((r) => ({ ...r, tab: 'withdraw', supplied: r.amount, paused: r.status === 'dijeda' })),
    prepare: (row, ctx) => {
      const { amount } = ctx;
      // Saldo yang dibandingkan nextStep = saldo supply, bukan wallet; izin cuma untuk ETH (aWETH ke gateway).
      const supply = { balance: row.supplied, allowance: row.allowance ?? 0n, requiresApprovalReset: false };
      if (amount === null) return { ...noSim, action: { action: 'withdraw', plan: null, ...risk(null, ctx) }, ...supply };
      const withdraw = withdrawPlan({ supplied: row.supplied, amount, liquidityRate: row.supplyRate });
      // Withdraw semua dikirim sebagai uint256.max; simulasi memotongnya ke saldo.
      const sent = withdraw.all ? withdraw.send : amount;
      const sim = simulateIf(ctx, (read) => simulate(read, ctx.whitelist, { action: 'withdraw', asset: row.asset, amount: sent }));
      return { sim, repay: null, withdraw, action: { action: 'withdraw', plan: withdraw, ...risk(sim, ctx) }, ...supply };
    },
  },
  collateral: {
    main: 'setCollateral',
    gateway: false,
    assets: (view) =>
      view.supplies
        .filter((r) => !r.outside)
        .map((r) => ({ ...r, tab: 'collateral', supplied: r.amount, paused: r.status === 'dijeda' })),
    prepare: (row, ctx) => {
      const enable = !row.collateral;
      const sim = simulateIf(ctx, (read) => simulate(read, ctx.whitelist, { action: 'collateral', asset: row.asset, enable }));
      const action: ActionInput = { action: 'collateral', enable, canEnable: row.canBeCollateral, ...risk(sim, ctx) };
      return { ...noSim, sim, action, ...noWallet };
    },
  },
};

// Hubungan `tab` ↔ tipe aset dijaga oleh tipe `PANEL_TABS`; TypeScript nggak bisa mengikutinya lewat `PANEL_TABS[tab]`.
const specOf = (tab: PanelTab) => PANEL_TABS[tab] as unknown as TabSpec<PanelAsset>;

export const panelAssets = (view: ChainView, tab: PanelTab): PanelAsset[] => specOf(tab).assets(view);

/** Isi panel dari data satu chain: simulasi, rencana repay/withdraw, lalu tombol utama lewat `nextStep`. */
export function evaluatePanel(read: ChainRead, view: ChainView, whitelist: WhitelistAsset[], input: PanelInput): PanelState {
  const spec = specOf(input.tab);
  const source = spec.assets(view).find((r) => r.asset === input.asset);
  const common = {
    connected: input.connected,
    txLocked: input.txLocked,
    data: 'ready' as const,
    txRunning: input.txRunning,
    amount: input.amount,
    approvalMode: input.approvalMode,
  };
  // Aset hilang dari tab (mis. utang sudah lunas): panel cuma menampilkan pesan kosong tanpa tombol utama, jadi yang
  // tersisa urutan umumnya saja.
  if (!source) {
    const step = nextStep({ ...common, amount: null, paused: false, native: false, ...noWallet, action: { action: 'supply' } });
    return { step, ...noSim };
  }
  const { sim, repay, withdraw, ...rest } = spec.prepare(source, { read, view, whitelist, ...input });
  const native = spec.gateway && source.native;
  return { step: nextStep({ ...common, paused: source.paused, native, ...rest }), sim, repay, withdraw };
}

export type PanelTx = {
  main: MainStep;
  /** Argumen `amount` transaksi utama (repay lunas penuh / withdraw semua = `type(uint256).max`). */
  send: bigint;
  /** Jumlah yang ditampilkan & dicatat: utang/saldo saat ini untuk lunas penuh, withdraw semua, dan toggle jaminan. */
  shown: bigint;
  /** Repay lunas penuh / withdraw semua. */
  full: boolean;
  /** Toggle jaminan: nyalakan (`true`) atau matikan; tab lain nggak memakainya. */
  useAsCollateral: boolean;
  /**
   * ETH lewat gateway: transaksi utama (dan izinnya) ke WrappedTokenGateway, dengan `value` ETH ini (cuma supply/repay;
   * withdraw/borrow 0). `null` = langsung ke Pool.
   */
  gateway: { value: bigint } | null;
  historyKind: LocalTxEntry['kind'];
};

/** Jalur transaksi: ERC20 (dan toggle jaminan) langsung ke Aave Pool, ETH lewat WrappedTokenGateway. */
export type Route = 'pool' | 'gateway';
export const routeOf = (tab: PanelTab, native: boolean): Route => (native && PANEL_TABS[tab].gateway ? 'gateway' : 'pool');

/** Apa yang dikirim ke kontrak, ditampilkan, dan dicatat di riwayat untuk isi panel saat ini. */
export function panelTx(row: PanelAsset, state: PanelState, amount: bigint | null): PanelTx {
  const { main } = PANEL_TABS[row.tab];
  const typed = amount ?? 0n;
  const native = routeOf(row.tab, row.native) === 'gateway';
  const base = { ...idleTx(row.tab), send: typed, shown: typed, gateway: native ? { value: 0n } : null };
  switch (row.tab) {
    case 'repay': {
      const full = state.repay?.full ?? false;
      // Repay ETH penuh: kirim utang + bantalan bunga; gateway mengembalikan kelebihannya.
      const value = full ? (state.repay?.spend ?? typed) : typed;
      const send = state.repay?.send ?? typed;
      return { ...base, send, shown: full ? row.debt : typed, full, gateway: native ? { value } : null, historyKind: 'repay' };
    }
    case 'withdraw': {
      const full = state.withdraw?.all ?? false;
      return { ...base, send: state.withdraw?.send ?? typed, shown: full ? row.supplied : typed, full, historyKind: 'withdraw' };
    }
    case 'supply':
      return { ...base, gateway: native ? { value: typed } : null, historyKind: 'supply' };
    case 'collateral': {
      const enable = !row.collateral;
      return { ...base, send: 0n, shown: row.supplied, useAsCollateral: enable, historyKind: enable ? 'collateralOn' : 'collateralOff' };
    }
    default:
      return { ...base, historyKind: row.tab };
  }
}

/** Rencana kosong: belum ada aset/jumlah (tombol utama nggak tampil, jadi ini nggak pernah dikirim). */
export function idleTx(tab: PanelTab): PanelTx {
  const main = PANEL_TABS[tab].main;
  return { main, send: 0n, shown: 0n, full: false, useAsCollateral: false, gateway: null, historyKind: 'supply' };
}
