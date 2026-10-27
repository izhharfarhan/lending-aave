import { chainFromParam, SUPPORTED_CHAINS } from './chains';

describe('chainFromParam()', () => {
  it('picks the chain from ?chain=', () => {
    expect(chainFromParam('base').chainId).toBe(8453);
    expect(chainFromParam('arbitrum').chainId).toBe(42161);
    expect(chainFromParam('ethereum').chainId).toBe(1);
  });

  it('falls back to Ethereum when the parameter is missing or unknown', () => {
    expect(chainFromParam(null).chainId).toBe(1);
    expect(chainFromParam('optimism').chainId).toBe(1);
    expect(chainFromParam('Base').chainId).toBe(1);
  });
});

describe('SUPPORTED_CHAINS', () => {
  it('has unique slugs and one ETH (native) asset per chain, listed first', () => {
    expect(new Set(SUPPORTED_CHAINS.map((c) => c.slug)).size).toBe(SUPPORTED_CHAINS.length);
    for (const chain of SUPPORTED_CHAINS) {
      expect([chain.slug, chain.whitelist.filter((a) => a.native).map((a) => a.symbol)]).toEqual([chain.slug, ['ETH']]);
      expect(chain.whitelist[0].native).toBe(true);
    }
  });

  it('whitelists by address: Base without USDT, Arbitrum native USDC (not USDC.e), Base USDC (not USDbC)', () => {
    const symbols = (slug: string) => chainFromParam(slug).whitelist.map((a) => a.symbol);
    expect(symbols('base')).toEqual(['ETH', 'USDC']);
    expect(symbols('arbitrum')).toEqual(['ETH', 'USDC', 'USDT']);
    // USDC native Arbitrum & USDC Base (Circle), bukan USDC.e 0xFF97… / USDbC 0xd9aA….
    expect(chainFromParam('arbitrum').whitelist[1].address).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
    expect(chainFromParam('base').whitelist[1].address).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  });
});
