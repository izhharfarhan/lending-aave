import { maxUint256, type Address } from 'viem';

import {
  accountView,
  baseToUsd,
  debtBalance,
  suppliedBalance,
  type AccountRead,
  type AccountView,
  type ChainRead,
  type ReserveRead,
  type WhitelistAsset,
} from './chainPosition';

const WAD = 10n ** 18n;
const RAY = 10n ** 27n;
const BPS = 10_000n;
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

/** Aksi yang disimulasikan; supply menyusul (panel supply belum menampilkan HF sesudah). */
export type PositionChange =
  | { action: 'borrow' | 'repay' | 'withdraw'; asset: Address; amount: bigint }
  /** Menyalakan / mematikan aset sebagai jaminan. */
  | { action: 'collateral'; asset: Address; enable: boolean };

/** Tingkat konfirmasi #9 sesudah aksi. */
export type Gate = 'none' | 'warn' | 'check' | 'type' | 'locked';

// Q14: HF(P) = (a·P + b) / (c·P + d) terhadap harga ETH P; harga likuidasi = P saat HF = 1.
export type LiqPrice =
  /** `pct` = selisih terhadap harga oracle saat ini, mis. −0,25 = turun 25%. */
  | { kind: 'price'; price: number; dir: 'turun' | 'naik'; pct: number }
  /** HF sudah < 1. */
  | { kind: 'now' }
  /** HF nggak bergantung pada harga ETH. */
  | { kind: 'none' }
  /** Ada aset volatil lain (aset luar) di jaminan/utang: angka disembunyikan, lihat HF. */
  | { kind: 'mixed' }
  | { kind: 'noDebt' };

export type Simulation = {
  account: AccountView;
  /** Posisi sesudah aksi melewati batas LTV (aturan `validateHFAndLtv` kontrak). */
  overLtv: boolean;
  /**
   * Aturan ltv0 kontrak (`validateHFAndLtvzero`): selama masih ada jaminan ber-LTV 0, withdraw/mematikan jaminan lain
   * ditolak (`LtvValidationFailed`). Aset ber-LTV 0 itu yang harus ditarik/dimatikan dulu.
   */
  ltvZero: boolean;
  gate: Gate;
  liquidation: LiqPrice;
};

/** Posisi user di satu reserve, dalam satuan terkecil token, termasuk bunga sampai `blockTimestamp`. */
type Holding = { reserve: ReserveRead; supplied: bigint; collateral: boolean; debt: bigint };

function holdings(read: ChainRead): Holding[] {
  const reserveOf = new Map(read.reserves.map((r) => [r.underlyingAsset.toLowerCase(), r]));
  return (read.user?.reserves ?? []).flatMap((position) => {
    const reserve = reserveOf.get(position.underlyingAsset.toLowerCase());
    if (!reserve) return [];
    return [
      {
        reserve,
        supplied: suppliedBalance(position.scaledATokenBalance, reserve, read.blockTimestamp),
        collateral: position.usageAsCollateralEnabledOnUser,
        debt: debtBalance(position.scaledVariableDebt, reserve, read.blockTimestamp),
      },
    ];
  });
}

/** Posisi chain sesudah aksi, dihitung dengan aturan kontrak yang sama dengan `accountFromReserves`. */
export function simulate(read: ChainRead, whitelist: WhitelistAsset[], change: PositionChange): Simulation {
  const list = holdings(read);
  const wasCollateral = findHolding(list, change.asset)?.collateral ?? false;
  const after = applyChange(read, list, change);
  const account = accountOf(after);
  const view = accountView(account, baseToUsd(read.baseCurrency));
  const overLtv = exceedsLtv(account);
  // Withdraw / mematikan jaminan cuma berisiko kalau aset itu memang sedang jadi jaminan.
  const reducesCollateral =
    wasCollateral && (change.action === 'withdraw' || (change.action === 'collateral' && !change.enable));
  // Repay dan menyalakan jaminan cuma bisa memperbaiki posisi: nggak pernah dikunci atau minta konfirmasi.
  const risky = change.action === 'borrow' || reducesCollateral;
  return {
    account: view,
    overLtv,
    ltvZero: reducesCollateral && breaksLtvZeroRule(after, change, account),
    // V8: withdraw dan mematikan jaminan dikunci di batas LTV, lebih ketat dari kontrak (yang cuma mensyaratkan HF ≥ 1).
    gate: risky ? confirmationGate(view.healthFactor, overLtv) : 'none',
    liquidation: liquidationOf(read, after, whitelist),
  };
}

/** Harga likuidasi posisi saat ini ("saat ini" = oracle chain ini di blok yang dibaca). */
export function liquidationPrice(read: ChainRead, whitelist: WhitelistAsset[]): LiqPrice {
  return liquidationOf(read, holdings(read), whitelist);
}

// #9: none ≥ 2,0 · warn 1,5–2,0 · check 1,1–1,5 (centang) · type < 1,1 (ketik "confirm") · locked lewat LTV.
export function confirmationGate(healthFactorAfter: number | null, overLtv: boolean): Gate {
  if (overLtv) return 'locked';
  if (healthFactorAfter === null || healthFactorAfter >= 2) return 'none';
  if (healthFactorAfter >= 1.5) return 'warn';
  if (healthFactorAfter >= 1.1) return 'check';
  return 'type';
}

export type RepayPlan = {
  /** Lunas penuh: dikirim sebagai `type(uint256).max`, Pool menarik utang persis saat tx dieksekusi (tanpa debu). */
  full: boolean;
  /** Argumen `amount` untuk `Pool.repay`. */
  send: bigint;
  /** Yang di-approve dan harus ada di wallet: utang + bantalan bunga 1 hari kalau lunas penuh. */
  spend: bigint;
  /**
   * Izin minimum untuk lanjut ke repay: utang + bunga 1 jam kalau lunas penuh. Lebih longgar dari `spend` supaya bunga
   * beberapa detik antara approve dan baca ulang nggak memicu approve kedua.
   */
  required: bigint;
};

// Bunga terus berjalan antara baca, approve, dan repay; bantalan = bunga 1 hari pada APR pinjaman saat ini.
const CUSHION_SECONDS = 24n * 60n * 60n;
const HOUR_SECONDS = 60n * 60n;

/** Bunga `principal` selama `seconds` pada `rate` (ray/tahun), dibulatkan ke atas dan minimal 1 wei (pembulatan aToken/debt). */
const interestAtLeastOne = (principal: bigint, rate: bigint, seconds: bigint) => {
  const value = ceilDiv(principal * rate * seconds, SECONDS_PER_YEAR * RAY);
  return value > 0n ? value : 1n;
};

/**
 * #8: lunas penuh kalau jumlahnya menutup utang dan saldo wallet cukup untuk utang + bantalan bunga. "Menutup" diberi
 * kelonggaran sebesar bantalan: utang yang dilihat user (dan yang dibaca ulang sesudah approve) selalu tertinggal bunga
 * beberapa detik dari utang saat tx dieksekusi, jadi jumlah = utang yang terlihat tetap berarti lunas.
 */
export function repayPlan(input: { debt: bigint; balance: bigint; amount: bigint; variableBorrowRate: bigint }): RepayPlan {
  const { debt, balance, amount } = input;
  const interest = (seconds: bigint) => interestAtLeastOne(debt, input.variableBorrowRate, seconds);
  const cushion = interest(CUSHION_SECONDS);
  if (amount + cushion >= debt && balance >= debt + cushion) {
    return { full: true, send: maxUint256, spend: debt + cushion, required: debt + interest(HOUR_SECONDS) };
  }
  return { full: false, send: amount, spend: amount, required: amount };
}

export type WithdrawPlan = {
  /** Withdraw semua: dikirim sebagai `type(uint256).max`, Pool membakar seluruh aToken saat tx dieksekusi (tanpa debu). */
  all: boolean;
  /** Argumen `amount` untuk `Pool.withdraw` / `withdrawETH`. */
  send: bigint;
  /**
   * Withdraw ETH: izin aWETH ke gateway yang diminta. Withdraw semua = saldo + bantalan bunga supply 1 hari, karena
   * gateway menarik seluruh aWETH saat tx dieksekusi (V2). ERC20 nggak butuh izin.
   */
  spend: bigint;
  /** Izin aWETH minimum untuk lanjut ke withdraw: saldo + bunga 1 jam kalau withdraw semua (pola `RepayPlan.required`). */
  required: bigint;
};

/**
 * Q26: withdraw semua kalau jumlahnya menutup saldo supply, dengan kelonggaran bunga supply 1 hari (saldo yang dilihat
 * user selalu tertinggal bunga beberapa detik, sama seperti repay penuh).
 */
export function withdrawPlan(input: { supplied: bigint; amount: bigint; liquidityRate: bigint }): WithdrawPlan {
  const { supplied, amount } = input;
  const interest = (seconds: bigint) => interestAtLeastOne(supplied, input.liquidityRate, seconds);
  const cushion = interest(CUSHION_SECONDS);
  // Jauh di atas saldo = salah ketik, bukan "semua": biar nextStep menolaknya sebagai saldo nggak cukup.
  if (amount + cushion >= supplied && amount <= supplied + cushion) {
    return { all: true, send: maxUint256, spend: supplied + cushion, required: supplied + interest(HOUR_SECONDS) };
  }
  return { all: false, send: amount, spend: amount, required: amount };
}

/** `getUserAccountData` yang dihitung ulang dari data per reserve (dasar simulasi; dibuktikan sama oleh test paritas). */
export function accountFromReserves(read: ChainRead): AccountRead {
  return accountOf(holdings(read));
}

// GenericLogic.calculateUserAccountData + calculateAvailableBorrows v3.7, pembulatan persis kontrak:
// jaminan = floor(saldo × harga / unit), utang = ceil(utang × harga / unit), HF = wadDiv(Σ jaminan × LT, utang) / 1e4.
// E-Mode (LT/LTV kategori) menyusul di tiket 14; di sini LT/LTV reserve.
function accountOf(list: Holding[]): AccountRead {
  let collateral = 0n;
  let debt = 0n;
  let ltvWeighted = 0n;
  let ltWeighted = 0n;
  for (const { reserve, supplied, collateral: isCollateral, debt: owed } of list) {
    const unit = 10n ** reserve.decimals;
    const price = reserve.priceInMarketReferenceCurrency;
    if (isCollateral) {
      const value = (supplied * price) / unit;
      collateral += value;
      ltvWeighted += value * reserve.baseLTVasCollateral;
      ltWeighted += value * reserve.reserveLiquidationThreshold;
    }
    if (owed > 0n) debt += ceilDiv(owed * price, unit);
  }
  const ltv = collateral === 0n ? 0n : ltvWeighted / collateral;
  const borrowLimit = (collateral * ltv) / BPS;
  return {
    totalCollateralBase: collateral,
    totalDebtBase: debt,
    availableBorrowsBase: borrowLimit > debt ? borrowLimit - debt : 0n,
    currentLiquidationThreshold: collateral === 0n ? 0n : ltWeighted / collateral,
    ltv,
    healthFactor: debt === 0n ? maxUint256 : (ltWeighted * WAD + debt / 2n) / debt / BPS,
  };
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

const findHolding = (list: Holding[], asset: Address) =>
  list.find((h) => h.reserve.underlyingAsset.toLowerCase() === asset.toLowerCase());
const min = (a: bigint, b: bigint) => (a < b ? a : b);

function applyChange(read: ChainRead, list: Holding[], change: PositionChange): Holding[] {
  const existing = findHolding(list, change.asset);
  const reserve = existing?.reserve ?? read.reserves.find((r) => r.underlyingAsset.toLowerCase() === change.asset.toLowerCase());
  if (!reserve) throw new Error(`Reserve ${change.asset} tidak ada di chain ini`);
  const before = existing ?? { reserve, supplied: 0n, collateral: false, debt: 0n };
  const changed = ((): Holding => {
    switch (change.action) {
      case 'borrow':
        return { ...before, debt: before.debt + change.amount };
      case 'repay':
        // Pool menarik paling banyak sebesar utang; kelebihan jumlah repay nggak dipakai.
        return { ...before, debt: before.debt - min(change.amount, before.debt) };
      case 'withdraw': {
        const supplied = before.supplied - min(change.amount, before.supplied);
        // Saldo habis = kontrak mematikan flag jaminannya.
        return { ...before, supplied, collateral: supplied > 0n && before.collateral };
      }
      case 'collateral':
        return { ...before, collateral: change.enable };
    }
  })();
  return existing ? list.map((h) => (h === existing ? changed : h)) : [...list, changed];
}

// Withdraw jaminan cuma dicek kontrak kalau user punya utang; mematikan jaminan selalu dicek.
function breaksLtvZeroRule(after: Holding[], change: PositionChange, account: AccountRead): boolean {
  if (change.action === 'withdraw' && account.totalDebtBase === 0n) return false;
  const hasZeroLtvCollateral = after.some((h) => h.collateral && h.supplied > 0n && h.reserve.baseLTVasCollateral === 0n);
  const asset = findHolding(after, change.asset);
  return hasZeroLtvCollateral && (asset?.reserve.baseLTVasCollateral ?? 0n) !== 0n;
}

// ValidationLogic.validateHFAndLtv: LTV rata-rata ≠ 0, HF ≥ 1, dan jaminan ≥ percentDivCeil(utang, LTV).
function exceedsLtv(account: AccountRead): boolean {
  if (account.totalDebtBase === 0n) return false;
  if (account.ltv === 0n || account.healthFactor < WAD) return true;
  return account.totalCollateralBase < ceilDiv(account.totalDebtBase * BPS, account.ltv);
}

// Satu-satunya aset volatil di whitelist adalah ETH (aset `native`, reserve WETH); aset whitelist lain stablecoin yang
// dianggap tetap di harga oracle saat ini. Aset luar yang ikut terhitung bisa volatil apa saja → `mixed`.
function liquidationOf(read: ChainRead, list: Holding[], whitelist: WhitelistAsset[]): LiqPrice {
  const account = accountOf(list);
  if (account.totalDebtBase === 0n) return { kind: 'noDebt' };
  // Sebelum `mixed`: HF < 1 tetap perlu ditulis, apa pun isi posisinya.
  if (account.healthFactor < WAD) return { kind: 'now' };

  const toUsd = baseToUsd(read.baseCurrency);
  const listed = new Set(whitelist.map((a) => a.address.toLowerCase()));
  const ethAddress = whitelist.find((a) => a.native)?.address.toLowerCase();
  let a = 0; // jaminan ETH × LT, dalam ETH
  let b = 0; // jaminan stable × LT, dalam USD
  let c = 0; // utang ETH, dalam ETH
  let d = 0; // utang stable, dalam USD
  let ethPrice = 0;
  for (const { reserve, supplied, collateral, debt } of list) {
    const lt = Number(reserve.reserveLiquidationThreshold) / Number(BPS);
    const countsAsCollateral = collateral && supplied > 0n && lt > 0;
    if (!countsAsCollateral && debt === 0n) continue;
    const asset = reserve.underlyingAsset.toLowerCase();
    if (!listed.has(asset)) return { kind: 'mixed' };
    const unit = 10 ** Number(reserve.decimals);
    const price = toUsd(reserve.priceInMarketReferenceCurrency);
    const isEth = asset === ethAddress;
    if (isEth) ethPrice = price;
    if (countsAsCollateral) {
      const weighted = (Number(supplied) / unit) * lt;
      if (isEth) a += weighted;
      else b += weighted * price;
    }
    if (isEth) c += Number(debt) / unit;
    else d += (Number(debt) / unit) * price;
  }
  // Selisih ETH jaminan×LT dan utang ETH di bawah 1 wei: HF praktis konstan terhadap harga ETH.
  if (Math.abs(a - c) < 1e-18) return { kind: 'none' };
  const price = (d - b) / (a - c);
  if (!(price > 0)) return { kind: 'none' };
  return { kind: 'price', price, dir: a > c ? 'turun' : 'naik', pct: price / ethPrice - 1 };
}
