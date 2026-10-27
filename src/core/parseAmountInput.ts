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
