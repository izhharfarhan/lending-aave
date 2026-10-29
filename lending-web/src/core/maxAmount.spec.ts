import { belowLtvEdge, largestPassing, maxSpendableEth, minOf } from './maxAmount';

const ETH = (n: string) => BigInt(Math.round(Number(n) * 1e6)) * 10n ** 12n;

describe('maxSpendableEth()', () => {
  // Lantai Ethereum 0,0005 ETH, L2 0,00005 ETH (SupportedChain.minGasReserve).
  const ethereum = 500_000_000_000_000n;
  const l2 = 50_000_000_000_000n;

  it('keeps the chain floor when the fee is unknown, rounded down to 6 decimals', () => {
    expect(maxSpendableEth({ balance: ETH('1') + 123n, minGasReserve: ethereum, networkFee: null })).toBe(ETH('0.9995'));
    expect(maxSpendableEth({ balance: ETH('1'), minGasReserve: l2, networkFee: null })).toBe(ETH('0.99995'));
  });

  it('keeps twice the fee once that is above the floor', () => {
    expect(maxSpendableEth({ balance: ETH('1'), minGasReserve: ethereum, networkFee: ETH('0.001') })).toBe(ETH('0.998'));
    expect(maxSpendableEth({ balance: ETH('1'), minGasReserve: ethereum, networkFee: ETH('0.0001') })).toBe(ETH('0.9995'));
  });

  it('is 0 when the balance does not cover the reserve', () => {
    expect(maxSpendableEth({ balance: ethereum, minGasReserve: ethereum, networkFee: null })).toBe(0n);
    expect(maxSpendableEth({ balance: 0n, minGasReserve: ethereum, networkFee: null })).toBe(0n);
  });
});

describe('largestPassing()', () => {
  it('finds the largest amount that still passes', () => {
    expect(largestPassing(1_000n, (a) => a <= 737n)).toBe(737n);
  });

  it('returns the upper bound when it passes, and 0 when nothing does', () => {
    expect(largestPassing(1_000n, () => true)).toBe(1_000n);
    expect(largestPassing(1_000n, () => false)).toBe(0n);
    expect(largestPassing(0n, () => true)).toBe(0n);
  });
});

describe('belowLtvEdge() / minOf()', () => {
  it('shaves 0,1% off an amount at the LTV edge', () => {
    expect(belowLtvEdge(1_000_000n)).toBe(999_000n);
  });

  it('takes the smallest, treating null as no limit', () => {
    expect(minOf(5n, null, 3n, null)).toBe(3n);
    expect(minOf(5n, null)).toBe(5n);
  });
});
