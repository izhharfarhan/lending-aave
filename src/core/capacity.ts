import { debtBalance, suppliedBalance, type ReserveRead } from './chainPosition';

/** Sisa kapasitas pool untuk satu reserve, satuan terkecil token (Q27). `null` = cap 0 (tanpa batas). */
export type Capacity = {
  /** Jumlah supply yang masih muat di supply cap. */
  supplyCap: bigint | null;
  /** Jumlah pinjaman yang masih muat di borrow cap. */
  borrowCap: bigint | null;
  /** Likuiditas yang bisa dipinjam / ditarik (`virtualUnderlyingBalance`). */
  liquidity: bigint;
};

/** Reserve yang nggak ada di data chain: nggak ada yang perlu dikunci. */
export const NO_CAPACITY_LIMIT: Capacity = { supplyCap: null, borrowCap: null, liquidity: 2n ** 256n - 1n };

/**
 * Bunga berjalan antara baca dan eksekusi menambah supply/utang pool. Tombol utama mengunci jumlah yang ditolak kontrak
 * SAAT INI (horizon 0, Q27 "pasti ditolak"); MAX memakai kuota 10 menit ke depan, jadi masih lolos sesudah approve dan
 * nggak langsung dikunci tombol karena bunga beberapa detik. Nggak lebih panjang: di pool besar bunga per detik besar
 * (USDC Ethereum ±2,5 USDC/detik), jadi 1 jam menyembunyikan ±9.000 USDC sisa kuota.
 */
export const MAX_CAPACITY_HORIZON_SECONDS = 10n * 60n;
const BPS = 10_000n;

// Aturan kontrak v3.7 (ValidationLogic, V8):
// - supply: (scaledTotalSupply + scaledAmount + accruedToTreasury) × nextLiquidityIndex ≤ supplyCap × 10^decimals.
//   accruedToTreasury ikut bertambah oleh updateState sebelum dicek: bagian reserveFactor dari bunga pinjaman.
// - borrow: (scaledVariableDebt + amountScaled) × nextVariableBorrowIndex ≤ borrowCap × 10^decimals. Dua pembulatan ke
//   atas (amountScaled dan saldo utang) bisa menambah sampai 2 unit, jadi sisanya dikurangi 2.
// - likuiditas: borrow/withdraw mengurangi virtualUnderlyingBalance; lebih dari itu gagal.
export function poolCapacity(reserve: ReserveRead, scaledATokenSupply: bigint, now: bigint, horizonSeconds = 0n): Capacity {
  const unit = 10n ** reserve.decimals;
  const later = now + horizonSeconds;
  const debtNow = debtBalance(reserve.totalScaledVariableDebt, reserve, BigInt(reserve.lastUpdateTimestamp));
  const debtLater = debtBalance(reserve.totalScaledVariableDebt, reserve, later);
  const treasuryLater = ((debtLater - debtNow) * reserve.reserveFactor) / BPS;
  const supplied = suppliedBalance(scaledATokenSupply + reserve.accruedToTreasury, reserve, later) + treasuryLater;

  const left = (cap: bigint, used: bigint) => (cap === 0n ? null : cap * unit > used ? cap * unit - used : 0n);
  return {
    supplyCap: left(reserve.supplyCap, supplied),
    borrowCap: left(reserve.borrowCap, debtLater + 2n),
    liquidity: reserve.virtualUnderlyingBalance,
  };
}
