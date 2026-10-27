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

/** Aksi yang disimulasikan; supply/withdraw/toggle jaminan menyusul di tiket 05. */
export type PositionChange = { action: 'borrow' | 'repay'; asset: Address; amount: bigint };

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
  const after = applyChange(read, holdings(read), change);
  const account = accountOf(after);
  const view = accountView(account, baseToUsd(read.baseCurrency));
  const overLtv = exceedsLtv(account);
  return {
    account: view,
    overLtv,
    // Repay cuma bisa memperbaiki posisi: nggak pernah dikunci atau minta konfirmasi.
    gate: change.action === 'repay' ? 'none' : confirmationGate(view.healthFactor, overLtv),
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
  /** Yang harus tersedia di wallet dan diizinkan ke Pool (utang + bantalan bunga kalau lunas penuh). */
  spend: bigint;
};

// Bunga terus berjalan antara baca, approve, dan repay; bantalan = bunga 1 hari pada APR pinjaman saat ini.
const CUSHION_SECONDS = 24n * 60n * 60n;

/**
 * #8: lunas penuh kalau jumlahnya menutup utang dan saldo wallet cukup untuk utang + bantalan bunga. "Menutup" diberi
 * kelonggaran sebesar bantalan: utang yang dilihat user (dan yang dibaca ulang sesudah approve) selalu tertinggal bunga
 * beberapa detik dari utang saat tx dieksekusi, jadi jumlah = utang yang terlihat tetap berarti lunas.
 */
export function repayPlan(input: { debt: bigint; balance: bigint; amount: bigint; variableBorrowRate: bigint }): RepayPlan {
  const { debt, balance, amount } = input;
  const computed = ceilDiv(debt * input.variableBorrowRate * CUSHION_SECONDS, SECONDS_PER_YEAR * RAY);
  const cushion = computed > 0n ? computed : 1n;
  if (amount + cushion >= debt && balance >= debt + cushion) return { full: true, send: maxUint256, spend: debt + cushion };
  return { full: false, send: amount, spend: amount };
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

function applyChange(read: ChainRead, list: Holding[], { action, asset, amount }: PositionChange): Holding[] {
  const key = asset.toLowerCase();
  const existing = list.find((h) => h.reserve.underlyingAsset.toLowerCase() === key);
  const reserve = existing?.reserve ?? read.reserves.find((r) => r.underlyingAsset.toLowerCase() === key);
  if (!reserve) throw new Error(`Reserve ${asset} tidak ada di chain ini`);
  const before = existing ?? { reserve, supplied: 0n, collateral: false, debt: 0n };
  // Pool menarik paling banyak sebesar utang; kelebihan jumlah repay nggak dipakai.
  const debt = action === 'borrow' ? before.debt + amount : before.debt - (amount < before.debt ? amount : before.debt);
  const changed = { ...before, debt };
  return existing ? list.map((h) => (h === existing ? changed : h)) : [...list, changed];
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
