'use client';

import type { Address } from 'viem';

import { tokenLogo } from '@/config/tokenLogos';

import { LogoMark } from './LogoMark';

const TOKEN_COLOR: Record<string, string> = { ETH: '--tok-eth', USDC: '--tok-usdc', USDT: '--tok-usdt', wstETH: '--tok-wsteth' };

// Logo asli token (tiket 26), dipetakan per alamat + chain. Token tanpa logo, file yang gagal dimuat, atau `asset` null
// (riwayat lokal lama yang cuma menyimpan simbol, tiket 27) jatuh ke inisial di lingkaran berwarna (bentuk lama, Q20).
export function TokenIcon({ chainId, asset, symbol, size = 22 }: { chainId: number; asset: Address | null; symbol: string; size?: number }) {
  const initials = (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `var(${TOKEN_COLOR[symbol] ?? '--tok-other'})` }}
    >
      {symbol === 'ETH' ? 'E' : symbol.slice(0, 2)}
    </span>
  );
  return <LogoMark logo={asset && tokenLogo(chainId, asset)} alt={symbol} size={size} rounded="rounded-full" fallback={initials} />;
}
