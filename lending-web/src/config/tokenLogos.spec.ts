import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAddress, type Address } from 'viem';

import { SUPPORTED_CHAINS } from './chains';
import { TOKEN_LOGOS, tokenLogo } from './tokenLogos';

// Alamat ditulis tangan dari explorer, bukan dari address-book, biar test nggak lulus dengan sendirinya.
const ETHEREUM = 1;
const BASE = 8453;
const ARBITRUM = 42161;
const WETH_ETHEREUM: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDT_ETHEREUM: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_BASE: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDBC_BASE: Address = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
const USDC_ARBITRUM: Address = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_E_ARBITRUM: Address = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const USDT0_ARBITRUM: Address = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const GHO_ETHEREUM: Address = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';
const DAI_ETHEREUM: Address = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

describe('tokenLogo()', () => {
  describe('positive', () => {
    it('gives every whitelist asset on every chain a real logo', () => {
      for (const chain of SUPPORTED_CHAINS)
        for (const asset of chain.whitelist) expect({ chain: chain.name, symbol: asset.symbol, logo: tokenLogo(chain.chainId, asset.address) }).toMatchObject({ logo: expect.any(Object) });
    });

    it('shows WETH (the reserve behind ETH) with the ETH logo', () => {
      expect(tokenLogo(ETHEREUM, WETH_ETHEREUM)?.src).toBe('/tokens/eth.svg');
    });

    it('maps by address per chain: USDT on Ethereum vs USD₮0 on Arbitrum', () => {
      expect(tokenLogo(ETHEREUM, USDT_ETHEREUM)?.src).toBe('/tokens/usdt.svg');
      expect(tokenLogo(ARBITRUM, USDT0_ARBITRUM)?.src).toBe('/tokens/usdt0.svg');
    });

    it('gives native USDC the USDC logo on Base and Arbitrum', () => {
      expect(tokenLogo(BASE, USDC_BASE)?.src).toBe('/tokens/usdc.png');
      expect(tokenLogo(ARBITRUM, USDC_ARBITRUM)?.src).toBe('/tokens/usdc.png');
    });

    it('gives an outside asset its real logo when the issuer publishes one', () => {
      expect(tokenLogo(ETHEREUM, GHO_ETHEREUM)?.src).toBe('/tokens/gho.svg');
    });

    it('ignores address casing', () => {
      expect(tokenLogo(ETHEREUM, USDT_ETHEREUM.toLowerCase() as Address)?.src).toBe('/tokens/usdt.svg');
    });
  });

  describe('negative: fallback ke inisial', () => {
    it('never lends the native USDC logo to bridged USDC (USDbC on Base, USDC.e on Arbitrum)', () => {
      expect(tokenLogo(BASE, USDBC_BASE)?.src).not.toBe('/tokens/usdc.png');
      expect(tokenLogo(ARBITRUM, USDC_E_ARBITRUM)?.src).not.toBe('/tokens/usdc.png');
    });

    it('leaves an outside asset without an issuer logo on initials', () => {
      expect(tokenLogo(ETHEREUM, DAI_ETHEREUM)).toBeNull();
    });

    it('has no logo for an address from another chain', () => {
      expect(tokenLogo(BASE, USDT_ETHEREUM)).toBeNull();
    });

    it('has no logo for an unknown token or chain', () => {
      expect(tokenLogo(ETHEREUM, '0x0000000000000000000000000000000000000001')).toBeNull();
      expect(tokenLogo(10, USDT_ETHEREUM)).toBeNull();
    });
  });

  describe('file', () => {
    it('points every mapped logo at a file that exists in public/, so no image is ever broken', () => {
      for (const [chainId, logos] of Object.entries(TOKEN_LOGOS))
        for (const [address, logo] of Object.entries(logos)) {
          expect({ chainId, address, exists: existsSync(join(process.cwd(), 'public', logo.src)) }).toMatchObject({ exists: true });
          expect(address).toBe(getAddress(address));
        }
    });
  });
});
