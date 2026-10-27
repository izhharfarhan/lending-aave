import { riskLevel, type RiskLevel } from '@/core/chainPosition';
import { POSITION, RISK } from '@/copy';
import { hf } from './format';

// Aman = netral; cuma Waspada/Bahaya yang berwarna (Q20).
export const RISK_TONE: Record<RiskLevel, string> = { aman: 'text-ink', waspada: 'text-warn', bahaya: 'text-danger' };

/** HF + tingkat risiko; `null` = tidak ada utang. */
export function HealthFactor({ value, withLabel = true }: { value: number | null; withLabel?: boolean }) {
  if (value === null) return <span className="text-muted">{POSITION.noDebt}</span>;
  const level = riskLevel(value);
  return (
    <span className={RISK_TONE[level]}>
      <span className="num">{hf(value)}</span>
      {withLabel && <span className="ml-1.5 text-[0.85em] opacity-80">{RISK[level]}</span>}
    </span>
  );
}
