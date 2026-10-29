export type Elapsed = { amount: number; unit: 'second' | 'minute' | 'hour' | 'day' };

// "x menit lalu": dibulatkan ke bawah ke satuan utuh terbesar. Teksnya di copy.ts.
export function elapsed(seconds: number): Elapsed {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return { amount: s, unit: 'second' };
  if (s < 3600) return { amount: Math.floor(s / 60), unit: 'minute' };
  if (s < 86_400) return { amount: Math.floor(s / 3600), unit: 'hour' };
  return { amount: Math.floor(s / 86_400), unit: 'day' };
}

/**
 * Umur entri riwayat (Q30): `timestamp` blok tx-nya terhadap timestamp blok terbaru **chain yang sama**, bukan
 * `Date.now()`, jadi tetap benar sesudah "maju waktu" di fork atau saat jam node tertinggal. `null` = blok terbaru chain
 * itu belum terbaca.
 */
export function historyAge(timestamp: number, latestBlockTimestamp: number | null): Elapsed | null {
  return latestBlockTimestamp === null ? null : elapsed(latestBlockTimestamp - timestamp);
}
