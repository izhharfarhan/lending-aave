import type { EModeRead, ReserveRead, WhitelistAsset } from './chainPosition';

// Aturan E-Mode per aset (DECISIONS.md V4), persis aave-v3-origin v3.7: `ValidationLogic.getUserReserveLtv` (LTV, dipakai
// juga untuk jaminan otomatis, nyalakan jaminan, dan aturan ltv0), `GenericLogic.calculateUserAccountData` (LT), dan
// `validateBorrow` (boleh dipinjam). Bitmap di-index pakai id reserve.

const onBitmap = (bitmap: bigint, id: number) => ((bitmap >> BigInt(id)) & 1n) === 1n;

/** LTV dan LT (bps) yang berlaku untuk user di reserve ini; `eMode` `null` = di luar E-Mode. */
export function collateralParams(reserve: ReserveRead, eMode: EModeRead | null): { ltv: bigint; liquidationThreshold: bigint } {
  if (eMode && onBitmap(eMode.collateralBitmap, reserve.id)) {
    return { ltv: onBitmap(eMode.ltvzeroBitmap, reserve.id) ? 0n : eMode.ltv, liquidationThreshold: eMode.liquidationThreshold };
  }
  return { ltv: eMode?.isolated ? 0n : reserve.baseLTVasCollateral, liquidationThreshold: reserve.reserveLiquidationThreshold };
}

/** Boleh dipinjam menurut konfigurasi: di E-Mode cuma `borrowableBitmap` (flag `borrowingEnabled` diabaikan). */
export const borrowableIn = (reserve: ReserveRead, eMode: EModeRead | null): boolean =>
  eMode ? onBitmap(eMode.borrowableBitmap, reserve.id) : reserve.borrowingEnabled;

/** Keterangan E-Mode dari isi kategorinya (V4: label on-chain di-soft-deprecate, cuma untuk detail). */
export type EModeView = { label: string; collateral: string[]; borrowable: string[] };

/** Isi kategori sebagai simbol: aset whitelist dulu (nama app, mis. "ETH"), lalu aset luar urut id reserve. */
export function eModeView(eMode: EModeRead, reserves: ReserveRead[], whitelist: WhitelistAsset[]): EModeView {
  const listed = (r: ReserveRead) => whitelist.findIndex((a) => a.address.toLowerCase() === r.underlyingAsset.toLowerCase());
  const symbols = (bitmap: bigint) =>
    reserves
      .filter((r) => onBitmap(bitmap, r.id))
      .map((r) => ({ r, i: listed(r) }))
      .map(({ r, i }) => ({ rank: i === -1 ? whitelist.length + r.id : i, symbol: i === -1 ? r.symbol : whitelist[i].symbol }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ symbol }) => symbol);
  return { label: eMode.label, collateral: symbols(eMode.collateralBitmap), borrowable: symbols(eMode.borrowableBitmap) };
}
