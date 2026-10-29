import type { ReactNode } from 'react';

/** Istilah asli Aave + ⓘ berisi penjelasan sederhana (Q8). */
export function Term({ info, children }: { info: string; children: ReactNode }) {
  return (
    <span title={info}>
      {children}
      <span className="ml-1 text-[10px] text-faint">ⓘ</span>
    </span>
  );
}
