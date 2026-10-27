export type Elapsed = { amount: number; unit: 'second' | 'minute' | 'hour' | 'day' };

// "x menit lalu": dibulatkan ke bawah ke satuan utuh terbesar. Teksnya di copy.ts.
export function elapsed(seconds: number): Elapsed {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return { amount: s, unit: 'second' };
  if (s < 3600) return { amount: Math.floor(s / 60), unit: 'minute' };
  if (s < 86_400) return { amount: Math.floor(s / 3600), unit: 'hour' };
  return { amount: Math.floor(s / 86_400), unit: 'day' };
}
