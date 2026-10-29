import type { ReactNode } from 'react';

import { riskLevel, type RiskLevel } from '@/core/chainPosition';
import { PANEL, POSITION, RISK } from '@/copy';
import { hf } from './format';

// Aman = netral; cuma Waspada/Bahaya yang berwarna (Q20).
export const RISK_TONE: Record<RiskLevel, string> = { aman: 'text-ink', waspada: 'text-warn', bahaya: 'text-danger' };
// Warna bar batas pinjam = tier HF chain-nya (Q24), bukan ambang persen sendiri.
export const RISK_BAR: Record<RiskLevel, string> = { aman: 'bg-muted', waspada: 'bg-warn', bahaya: 'bg-danger' };

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

/**
 * HF sebelum → sesudah aksi. `after` `undefined` = belum diketahui (jumlah belum diisi): "…", dan label tingkat risiko
 * pindah ke HF sebelum. `null` = tanpa utang.
 */
export function HealthFactorChange({ before, after }: { before: number | null; after: number | null | undefined }) {
  const pending: ReactNode = <span className="text-faint">{PANEL.pendingAfter}</span>;
  return (
    <span>
      <HealthFactor value={before} withLabel={after === undefined} /> <span className="text-faint">{PANEL.arrow}</span>{' '}
      {after === undefined ? pending : <HealthFactor value={after} />}
    </span>
  );
}
