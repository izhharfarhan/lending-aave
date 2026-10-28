'use client';

import { chainLogo } from '@/config/chainLogos';
import { supportedChain } from '@/config/chains';

import { LogoMark } from './LogoMark';

// Logo chain (tiket 27) menggantikan inisial E/B/A; tanpa logo atau file gagal dimuat → inisial di kotak warna chain.
export function ChainIcon({ chainId, size = 18 }: { chainId: number; size?: number }) {
  const chain = supportedChain(chainId);
  const initial = (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] font-bold text-[var(--chain-ink)]"
      style={{ width: size, height: size, fontSize: size / 2, background: `var(--chain-${chain.slug})` }}
    >
      {chain.name[0]}
    </span>
  );
  return <LogoMark logo={chainLogo(chainId)} alt={chain.name} size={size} rounded="rounded-[5px]" fallback={initial} />;
}
