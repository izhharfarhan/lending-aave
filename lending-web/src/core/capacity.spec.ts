import type { ReserveRead } from './chainPosition';
import { MAX_CAPACITY_HORIZON_SECONDS, poolCapacity } from './capacity';

const RAY = 10n ** 27n;
const USDC = (n: number) => BigInt(n) * 1_000_000n;
const NOW = 1_700_000_000n;

// Reserve USDC sintetis: indeks 1, bunga 0, diperbarui tepat di NOW (tanpa bunga berjalan kecuali diisi).
const reserve = (overrides: Partial<ReserveRead> = {}): ReserveRead =>
  ({
    underlyingAsset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    decimals: 6n,
    liquidityIndex: RAY,
    variableBorrowIndex: RAY,
    liquidityRate: 0n,
    variableBorrowRate: 0n,
    lastUpdateTimestamp: Number(NOW),
    supplyCap: 1_000n,
    borrowCap: 800n,
    accruedToTreasury: USDC(50),
    totalScaledVariableDebt: USDC(500),
    reserveFactor: 1_000n,
    virtualUnderlyingBalance: USDC(300),
    ...overrides,
  }) as ReserveRead;

describe('poolCapacity()', () => {
  it('leaves supply cap − (scaled supply + treasury) and borrow cap − debt, without interest', () => {
    // Supply: 1.000 − (900 + 50) = 50 USDC. Borrow: 800 − 500 − 2 wei pembulatan ke atas = 299,999998.
    expect(poolCapacity(reserve(), USDC(900), NOW)).toEqual({ supplyCap: USDC(50), borrowCap: USDC(300) - 2n, liquidity: USDC(300) });
  });

  it('treats a cap of 0 as no cap', () => {
    expect(poolCapacity(reserve({ supplyCap: 0n, borrowCap: 0n }), USDC(900), NOW)).toEqual({ supplyCap: null, borrowCap: null, liquidity: USDC(300) });
  });

  it('never goes below 0 when the pool is already past its cap', () => {
    expect(poolCapacity(reserve({ supplyCap: 900n, borrowCap: 400n }), USDC(900), NOW)).toMatchObject({ supplyCap: 0n, borrowCap: 0n });
  });

  it('MAX keeps 10 minutes of interest free, so an amount right at the cap still passes when the tx lands later', () => {
    const later = (r: ReserveRead) => poolCapacity(r, USDC(900), NOW, MAX_CAPACITY_HORIZON_SECONDS);
    // APR 52,56%: bunga 10 menit = 0,5256 × 600 / 31.536.000 = 0,001%. Supply: 0,001% dari 950 USDC = 9.500 unit.
    const supply = later(reserve({ liquidityRate: (5_256n * RAY) / 10_000n })).supplyCap!;
    expect(supply).toBe(USDC(50) - 9_500n);
    // Pinjaman: 0,001% dari 500 USDC = 5.000 unit + 0,025 suku majemuk, dibulatkan ke atas = 5.001; bagian treasury
    // (10%) = 500 unit ikut supply cap.
    const both = later(reserve({ variableBorrowRate: (5_256n * RAY) / 10_000n }));
    expect(both.borrowCap).toBe(USDC(300) - 5_001n - 2n);
    expect(both.supplyCap).toBe(USDC(50) - 500n);
  });

  it('locks typed amounts on the rule as it stands now: no interest ahead', () => {
    expect(poolCapacity(reserve({ liquidityRate: (5_256n * RAY) / 10_000n }), USDC(900), NOW).supplyCap).toBe(USDC(50));
  });
});
