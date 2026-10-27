const TOKEN_COLOR: Record<string, string> = { ETH: '--tok-eth', USDC: '--tok-usdc', USDT: '--tok-usdt', wstETH: '--tok-wsteth' };

// Logo token = inisial di lingkaran berwarna (Q20), tanpa aset bermerek.
export function TokenIcon({ symbol, size = 22 }: { symbol: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `var(${TOKEN_COLOR[symbol] ?? '--tok-other'})` }}
    >
      {symbol === 'ETH' ? 'E' : symbol.slice(0, 2)}
    </span>
  );
}
