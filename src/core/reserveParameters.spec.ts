import { readFileSync } from 'node:fs';
import type { Address } from 'viem';

import type { ChainRead, WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { reserveParameters } from './reserveParameters';

type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users: _users, ...chain } = fixture;
const read: ChainRead = { ...chain, user: null };

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WHITELIST: WhitelistAsset[] = [
  { address: WETH, symbol: 'ETH', native: true },
  { address: USDC, symbol: 'USDC', native: false },
  { address: USDT, symbol: 'USDT', native: false, requiresApprovalReset: true },
];

// "Detail parameter" (Q7): angka reserve di blok pin Ethereum, dihitung tangan dari fixture.
describe('reserveParameters()', () => {
  it('lists the whitelist reserves in whitelist order with their Aave parameters', () => {
    const [eth, usdc] = reserveParameters(read, WHITELIST);

    expect(eth).toEqual({
      asset: WETH,
      symbol: 'ETH',
      ltv: 0.805,
      liquidationThreshold: 0.83,
      // liquidationBonus 10.500 bps → penalti 5%.
      liquidationPenalty: 0.05,
      // Utang 1.725.624,97 WETH (scaled × index pinjaman sampai blok) ÷ (utang + virtualUnderlyingBalance 408.523,00).
      utilization: expect.closeTo(0.808578, 5),
      reserveFactor: 0.15,
      supplyCap: 2_700_000n,
      borrowCap: 2_400_000n,
      priceUsd: 2_306.77,
      aToken: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
    });
    expect(usdc).toMatchObject({ symbol: 'USDC', liquidationPenalty: expect.closeTo(0.045, 10), utilization: expect.closeTo(0.935712, 5) });
    expect(reserveParameters(read, WHITELIST).map((r) => r.symbol)).toEqual(['ETH', 'USDC', 'USDT']);
  });

  it('says "no cap" for a cap of 0 and utilization 0 for a reserve without debt or liquidity', () => {
    const empty = { ...read, reserves: read.reserves.map((r) => (r.underlyingAsset === USDT ? { ...r, supplyCap: 0n, borrowCap: 0n, totalScaledVariableDebt: 0n, virtualUnderlyingBalance: 0n } : r)) };

    expect(reserveParameters(empty, WHITELIST)[2]).toMatchObject({ supplyCap: null, borrowCap: null, utilization: 0 });
  });

  it('has no liquidation penalty for a reserve that cannot be collateral (bonus 0), not −100%', () => {
    const noCollateral = { ...read, reserves: read.reserves.map((r) => (r.underlyingAsset === USDT ? { ...r, reserveLiquidationBonus: 0n } : r)) };

    expect(reserveParameters(noCollateral, WHITELIST)[2].liquidationPenalty).toBeNull();
  });

  it('skips whitelist assets that have no reserve on this chain', () => {
    const missing = { ...read, reserves: read.reserves.filter((r) => r.underlyingAsset !== USDT) };

    expect(reserveParameters(missing, WHITELIST).map((r) => r.symbol)).toEqual(['ETH', 'USDC']);
  });
});
