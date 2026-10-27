import type { LiqPrice } from '@/core/simulate';
import { LIQUIDATION } from '@/copy';
import { pct, usd } from './format';

// Harga likuidasi dalam kalimat (Q14/Q15). Merah cuma kalau sudah bisa dilikuidasi (spec 84); warna risiko lain dari
// tier HF, bukan ambang persen baru (Q24).
export function liquidationText(liq: LiqPrice): { text: string; tone: string } | null {
  switch (liq.kind) {
    case 'noDebt':
      return null;
    case 'now':
      return { text: LIQUIDATION.now, tone: 'text-danger' };
    case 'none':
      return { text: LIQUIDATION.none, tone: 'text-muted' };
    case 'mixed':
      return { text: LIQUIDATION.mixed, tone: 'text-muted' };
    case 'price':
      return {
        text: LIQUIDATION.price(liq.dir, usd(liq.price), `${liq.pct > 0 ? '+' : '−'}${pct(Math.abs(liq.pct), 0)}`),
        tone: 'text-ink',
      };
  }
}

export function LiquidationText({ liq, current = false }: { liq: LiqPrice; current?: boolean }) {
  const shown = liquidationText(liq);
  if (!shown) return null;
  return (
    <span className={shown.tone}>
      {shown.text}
      {current && liq.kind === 'price' && <span className="ml-1.5 text-[0.85em] text-muted">({LIQUIDATION.current})</span>}
    </span>
  );
}
