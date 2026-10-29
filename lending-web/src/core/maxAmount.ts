// MAX per aksi (DECISIONS.md Q26): bagian yang sama untuk semua tab. Aturan per tab ada di `PANEL_TABS.max` (core/panel.ts).

// 1 unit di desimal ke-6 ETH = 10^(18 − 6) wei.
const ETH_ROUNDING_UNIT = 10n ** 12n;

/**
 * Saldo ETH yang boleh dipakai MAX supply/repay ETH (pola `maxSpendable` swap-web): saldo − max(lantai chain, biaya
 * jaringan × 2), dibulatkan ke bawah 6 desimal; saldo ≤ cadangan → 0. `networkFee` `null` (belum diketahui) → lantai.
 */
export function maxSpendableEth(input: { balance: bigint; minGasReserve: bigint; networkFee: bigint | null }): bigint {
  const doubled = (input.networkFee ?? 0n) * 2n;
  const reserve = doubled > input.minGasReserve ? doubled : input.minGasReserve;
  if (input.balance <= reserve) return 0n;
  return ((input.balance - reserve) / ETH_ROUNDING_UNIT) * ETH_ROUNDING_UNIT;
}

/**
 * Jumlah terbesar di [0, `upper`] yang lolos `ok`, dengan `ok` monoton (lolos di a → lolos di semua yang lebih kecil);
 * 0 kalau nggak ada. Dipakai untuk batas LTV: dicari lewat `simulate` yang sama dengan tombol utama.
 */
export function largestPassing(upper: bigint, ok: (amount: bigint) => boolean): bigint {
  if (upper <= 0n) return 0n;
  if (ok(upper)) return upper;
  if (!ok(0n)) return 0n;
  let low = 0n;
  let high = upper;
  while (high - low > 1n) {
    const mid = (low + high) / 2n;
    if (ok(mid)) low = mid;
    else high = mid;
  }
  return low;
}

// MAX di batas LTV disisakan 0,1%: bunga dan harga oracle bergeser antara baca dan eksekusi. Borrow ditolak kontrak
// (`CollateralCannotCoverNewBorrow`), withdraw dikunci app sendiri (#9) begitu posisinya dibaca ulang.
const LTV_EDGE_BPS = 10n;
export const belowLtvEdge = (amount: bigint) => amount - (amount * LTV_EDGE_BPS) / 10_000n;

/** Yang terkecil; `null` = tanpa batas (cap 0). */
export const minOf = (first: bigint, ...rest: (bigint | null)[]): bigint =>
  rest.reduce<bigint>((acc, v) => (v !== null && v < acc ? v : acc), first);
