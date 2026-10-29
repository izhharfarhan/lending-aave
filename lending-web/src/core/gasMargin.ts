/** Tambahan di atas `eth_estimateGas`, dalam basis poin (2000 = 20%). */
export const GAS_MARGIN_BPS = 2_000n;

// Estimasi jalan di state blok terakhir; tx beneran ditambang di blok baru dan bisa butuh lebih. Gas limit = estimasi
// + 20%, dibulatkan ke atas (pola swap-web). Ketemu juga di sini (tiket 03, fork Ethereum): supply USDC kedua dengan
// limit = estimasi polos (162.941) kehabisan gas di `mint` aToken USDC; replay dengan gas lebih besar sukses.
export function withGasMargin(estimate: bigint): bigint {
  if (estimate < 0n) throw new RangeError(`Estimasi gas negatif: ${estimate}`);

  const BPS = 10_000n;
  const scaled = estimate * (BPS + GAS_MARGIN_BPS);
  return (scaled + BPS - 1n) / BPS;
}
