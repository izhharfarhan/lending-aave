import { maxUint256, type Address } from 'viem';

import { MAX_CAPACITY_HORIZON_SECONDS, NO_CAPACITY_LIMIT, poolCapacity, type Capacity } from './capacity';
import type { ChainRead, ChainView, WhitelistAsset } from './chainPosition';
import type { LocalTxEntry } from './localHistory';
import { belowLtvEdge, largestPassing, maxSpendableEth, minOf } from './maxAmount';
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
  /** Biaya jaringan langkah-langkah `stepBeforeGasCheck` (lihat `nextStep`); `null` = belum diketahui. */
  networkFee: bigint | null;
};

export type PanelState = {
  step: NextStep;
  /**
   * Langkah kalau ETH untuk biaya jaringan dianggap cukup: transaksi yang biayanya perlu diestimasi. Dipisah dari `step`
   * supaya biaya tetap bisa dihitung walau tombolnya sedang terkunci "ETH kurang" (pola `remainingTxs` swap).
   */
  stepBeforeGasCheck: NextStep;
  /** Saldo ETH wallet di chain ini (yang membayar biaya jaringan); 0 kalau belum connect. */
  ethBalance: bigint;
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
  /** MAX (Q26) untuk aset ini; tanpa `max` = tab tanpa kolom jumlah. */
  max?: (row: A, ctx: MaxContext) => bigint;
};

/** Yang dibutuhkan MAX selain data chain: kuota pool (horizon MAX) dan cadangan gas ETH. */
export type MaxInput = {
  /** `SupportedChain.minGasReserve` chain ini. */
  minGasReserve: bigint;
  /** Biaya jaringan terakhir yang diketahui (cadangan gas MAX ETH); `null` = lantai chain. */
  networkFee: bigint | null;
};
type MaxContext = Pick<Context, 'read' | 'whitelist'> & MaxInput & { capacity: Capacity };

// MAX dari saldo wallet: ETH menyisakan cadangan gas.
const walletMax = (row: AssetBase & FromWallet, ctx: MaxContext) => {
  const balance = row.walletBalance ?? 0n;
  return row.native ? maxSpendableEth({ balance, minGasReserve: ctx.minGasReserve, networkFee: ctx.networkFee }) : balance;
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
    max: (row, ctx) => minOf(walletMax(row, ctx), ctx.capacity.supplyCap),
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
    max: (row, ctx) => {
      const pool = minOf(ctx.capacity.liquidity, ctx.capacity.borrowCap);
      // `borrowable` (sisa batas pinjam dari getUserAccountData) mempersempit pencarian; ×2 karena itu cuma perkiraan.
      const upper = minOf(pool, (row.borrowable ?? 0n) * 2n + 1n);
      const ok = (amount: bigint) => simulate(ctx.read, ctx.whitelist, { action: 'borrow', asset: row.asset, amount }).gate !== 'locked';
      const atLtv = largestPassing(upper, ok);
      return atLtv < pool ? belowLtvEdge(atLtv) : atLtv;
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
    // Lunas penuh kalau yang boleh dipakai menutup utang + bantalan; selain itu jumlah persis (Q26). ETH: jumlah yang
    // masuk rentang "lunas penuh" (jumlah + bantalan ≥ utang) bisa dikirim sebagai utang + bantalan dari saldo mentah dan
    // memakan cadangan gas, jadi berhenti tepat di bawah rentang itu.
    max: (row, ctx) => {
      const spendable = walletMax(row, ctx);
      const plan = (balance: bigint, amount: bigint) => repayPlan({ debt: row.debt, balance, amount, variableBorrowRate: row.borrowRate });
      if (plan(spendable, row.debt).full) return row.debt;
      if (!row.native) return minOf(row.debt, spendable);
      const cushion = plan(maxUint256, row.debt).spend - row.debt;
      return minOf(spendable, row.debt > cushion ? row.debt - cushion - 1n : 0n);
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
    // Jaminan yang dibutuhkan utang nggak ikut (#9). Seluruh saldo (kalau likuiditas cukup) → "withdraw semua"; di bawah
    // itu, jangan masuk rentang "withdraw semua" (withdrawPlan), yang menarik seluruh saldo dan bisa ditolak likuiditas.
    max: (row, ctx) => {
      const ok = (amount: bigint) => {
        const sim = simulate(ctx.read, ctx.whitelist, { action: 'withdraw', asset: row.asset, amount });
        return sim.gate !== 'locked' && !sim.ltvZero;
      };
      const upper = minOf(row.supplied, ctx.capacity.liquidity);
      if (upper === row.supplied && ok(upper)) return upper;
      const partial = (amount: bigint) => ok(amount) && !withdrawPlan({ supplied: row.supplied, amount, liquidityRate: row.supplyRate }).all;
      const best = largestPassing(upper, partial);
      return best < upper && !ok(best + 1n) ? belowLtvEdge(best) : best;
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

/**
 * Sisa kapasitas pool reserve aset ini (Q27); aset di luar data chain (panel kosong) = tanpa batas. `horizonSeconds` 0 =
 * aturan kontrak saat ini (kunci tombol); MAX memakai `MAX_CAPACITY_HORIZON_SECONDS`.
 */
export function capacityOf(read: ChainRead, asset: Address, horizonSeconds = 0n): Capacity {
  const reserve = read.reserves.find((r) => r.underlyingAsset.toLowerCase() === asset.toLowerCase());
  const scaled = Object.entries(read.scaledATokenSupplies).find(([address]) => address.toLowerCase() === asset.toLowerCase())?.[1];
  if (!reserve || scaled === undefined) return NO_CAPACITY_LIMIT;
  return poolCapacity(reserve, scaled, read.blockTimestamp, horizonSeconds);
}

/** MAX (Q26) untuk aset terpilih; `null` = belum connect, tab tanpa jumlah, atau aset nggak ada di tab ini. */
export function panelMax(
  read: ChainRead,
  view: ChainView,
  whitelist: WhitelistAsset[],
  input: MaxInput & { tab: PanelTab; asset: Address },
): bigint | null {
  const spec = specOf(input.tab);
  const row = spec.assets(view).find((r) => r.asset === input.asset);
  if (!spec.max || !row || !read.user) return null;
  const capacity = capacityOf(read, input.asset, MAX_CAPACITY_HORIZON_SECONDS);
  return spec.max(row, { read, whitelist, capacity, minGasReserve: input.minGasReserve, networkFee: input.networkFee });
}

/** Isi panel dari data satu chain: simulasi, rencana repay/withdraw, lalu tombol utama lewat `nextStep`. */
export function evaluatePanel(read: ChainRead, view: ChainView, whitelist: WhitelistAsset[], input: PanelInput): PanelState {
  const spec = specOf(input.tab);
  const source = spec.assets(view).find((r) => r.asset === input.asset);
  // Saldo ETH wallet = baris aset native di whitelist (ETH dibaca lewat `getEthBalance`).
  const nativeAsset = whitelist.find((a) => a.native);
  const ethBalance = (nativeAsset && read.user?.walletBalances[nativeAsset.address]) ?? 0n;
  const common = {
    connected: input.connected,
    txLocked: input.txLocked,
    data: 'ready' as const,
    txRunning: input.txRunning,
    amount: input.amount,
    approvalMode: input.approvalMode,
    ethBalance,
    networkFee: input.networkFee,
    capacity: capacityOf(read, input.asset),
  };
  // Cek biaya dinetralkan: ETH yang kurang nggak mengubah transaksi apa saja yang tersisa.
  const withGasCheck = (stepInput: NextStepInput) => ({
    step: nextStep(stepInput),
    stepBeforeGasCheck: nextStep({ ...stepInput, ethBalance: maxUint256, networkFee: null }),
    ethBalance,
  });
  // Aset hilang dari tab (mis. utang sudah lunas): panel cuma menampilkan pesan kosong tanpa tombol utama, jadi yang
  // tersisa urutan umumnya saja.
  if (!source) {
    return { ...withGasCheck({ ...common, amount: null, paused: false, native: false, ...noWallet, action: { action: 'supply' } }), ...noSim };
  }
  const { sim, repay, withdraw, ...rest } = spec.prepare(source, { read, view, whitelist, ...input });
  const native = spec.gateway && source.native;
  return { ...withGasCheck({ ...common, paused: source.paused, native, ...rest }), sim, repay, withdraw };
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
