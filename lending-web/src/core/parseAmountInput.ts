import { maxUint256, parseUnits } from 'viem';

export type ParseAmountResult =
  | { ok: true; value: bigint }
  | {
      ok: false;
      reason: 'empty' | 'zero' | 'not_a_number' | 'too_many_decimals' | 'overflow';
    };

// Titik dan koma dua-duanya pemisah desimal, nggak pernah pemisah ribuan:
// "1.000" = 1, "1,5" = 1.5 (pola swap-web Q25).
const AMOUNT_PATTERN = /^(\d*)[.,]?(\d*)$/;

export function parseAmountInput(input: string, decimals: number): ParseAmountResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  const match = AMOUNT_PATTERN.exec(trimmed);
  if (!match) return { ok: false, reason: 'not_a_number' };

  const [, whole, fraction] = match;
  if (whole === '' && fraction === '') return { ok: false, reason: 'not_a_number' };

  // parseUnits membulatkan desimal berlebih; kita tolak, jangan dibulatkan diam-diam.
  if (fraction.length > decimals) return { ok: false, reason: 'too_many_decimals' };

  const value = parseUnits(`${whole || '0'}.${fraction || '0'}`, decimals);
  if (value === 0n) return { ok: false, reason: 'zero' };
  if (value > maxUint256) return { ok: false, reason: 'overflow' };

  return { ok: true, value };
}

// Bentuk yang juga terbaca sebagai pemisah ribuan gaya Indonesia: 1–3 digit (bukan diawali 0), titik, tepat 3 digit,
// tanpa koma. App menulis angka dengan titik = ribuan (1.021,32), jadi "1.000" bisa dimaksud 1.000 padahal terbaca 1.
const THOUSANDS_LOOKALIKE = /^([1-9]\d{0,2})\.(\d{3})$/;

/**
 * Dua bacaan untuk input yang ambigu ("1.000" → 1 atau 1.000), atau `null`. Aturan parse nggak berubah; panel mengunci
 * tombol utama sampai user menulis ulang (koma untuk desimal, tanpa pemisah ribuan).
 */
export function ambiguousAmount(input: string): { asDecimal: string; asThousands: string } | null {
  const match = THOUSANDS_LOOKALIKE.exec(input.trim());
  if (!match) return null;
  const [asThousands, whole, fraction] = match;
  const decimals = fraction.replace(/0+$/, '');
  return { asDecimal: decimals ? `${whole},${decimals}` : whole, asThousands };
}
