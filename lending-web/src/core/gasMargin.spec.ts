import { withGasMargin } from './gasMargin';

describe('withGasMargin()', () => {
  describe('positive', () => {
    it('adds 20% to a round estimate', () => {
      expect(withGasMargin(100_000n)).toBe(120_000n);
    });

    it('covers the fork case that ran out of gas: estimate 145,877 must clear the 151,847 actually needed', () => {
      expect(withGasMargin(145_877n)).toBeGreaterThan(151_847n);
    });
  });

  describe('negative', () => {
    it('rejects a negative estimate', () => {
      expect(() => withGasMargin(-1n)).toThrow(RangeError);
    });
  });

  describe('edge case', () => {
    it('rounds up so the margin never disappears on a small estimate', () => {
      expect(withGasMargin(1n)).toBe(2n);
    });

    it('rounds 21,001 up rather than down (25,201.2 → 25,202)', () => {
      expect(withGasMargin(21_001n)).toBe(25_202n);
    });

    it('keeps zero at zero', () => {
      expect(withGasMargin(0n)).toBe(0n);
    });
  });
});
