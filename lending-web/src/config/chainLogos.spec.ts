import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { chainLogo, CHAIN_LOGOS } from './chainLogos';
import { SUPPORTED_CHAINS } from './chains';

describe('chainLogo()', () => {
  describe('positive', () => {
    it('gives every supported chain its own logo from public/chains/', () => {
      expect(chainLogo(1)?.src).toBe('/chains/ethereum.svg');
      expect(chainLogo(8453)?.src).toBe('/chains/base.svg');
      expect(chainLogo(42161)?.src).toBe('/chains/arbitrum.svg');
    });

    it('puts the Ethereum diamond (not a filled shape) on a light plate so it shows on the dark theme', () => {
      expect(chainLogo(1)?.plate).toBe(true);
    });
  });

  describe('negative: fallback ke inisial', () => {
    it('has no logo for a chain the app does not support', () => {
      expect(chainLogo(10)).toBeNull();
    });
  });

  describe('file', () => {
    it('maps exactly the supported chains, each to a file that exists in public/', () => {
      expect(Object.keys(CHAIN_LOGOS).map(Number).sort()).toEqual(SUPPORTED_CHAINS.map((c) => c.chainId).sort());
      for (const logo of Object.values(CHAIN_LOGOS)) expect({ src: logo.src, exists: existsSync(join(process.cwd(), 'public', logo.src)) }).toMatchObject({ exists: true });
    });
  });
});
