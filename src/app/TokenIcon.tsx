'use client';

import { useState } from 'react';
import type { Address } from 'viem';

import { tokenLogo } from '@/config/tokenLogos';

const TOKEN_COLOR: Record<string, string> = { ETH: '--tok-eth', USDC: '--tok-usdc', USDT: '--tok-usdt', wstETH: '--tok-wsteth' };

// Logo asli token (tiket 26) dari file lokal, dipetakan per alamat + chain. Token tanpa logo, atau file yang gagal
// dimuat, jatuh ke inisial di lingkaran berwarna (bentuk lama, Q20), jadi nggak pernah tampil gambar rusak.
export function TokenIcon({ chainId, asset, symbol, size = 22 }: { chainId: number; asset: Address; symbol: string; size?: number }) {
  const logo = tokenLogo(chainId, asset);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!logo || failedSrc === logo.src)
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
        style={{ width: size, height: size, fontSize: size * 0.36, background: `var(${TOKEN_COLOR[symbol] ?? '--tok-other'})` }}
      >
        {symbol === 'ETH' ? 'E' : symbol.slice(0, 2)}
      </span>
    );
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: logo.plate ? 'var(--tok-plate)' : undefined }}
    >
      <img
        src={logo.src}
        alt={symbol}
        width={size}
        height={size}
        className={logo.plate ? 'h-[72%] w-[72%] object-contain' : 'h-full w-full object-contain'}
        onError={() => setFailedSrc(logo.src)}
      />
    </span>
  );
}
