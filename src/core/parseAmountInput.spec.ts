import { maxUint256 } from 'viem';
import { parseAmountInput } from './parseAmountInput';

const USDC_DECIMALS = 6;
const ETH_DECIMALS = 18;

describe('parseAmountInput()', () => {
  describe('positive', () => {
    it('parses a whole number into base units', () => {
      expect(parseAmountInput('100', USDC_DECIMALS)).toEqual({ ok: true, value: 100_000_000n });
    });

    it('parses a dot decimal', () => {
      expect(parseAmountInput('1.5', ETH_DECIMALS)).toEqual({ ok: true, value: 1_500_000_000_000_000_000n });
    });

    it('parses a comma decimal the same as a dot', () => {
      expect(parseAmountInput('1,5', USDC_DECIMALS)).toEqual(parseAmountInput('1.5', USDC_DECIMALS));
    });

    it('accepts exactly the token decimals', () => {
      expect(parseAmountInput('0.000001', USDC_DECIMALS)).toEqual({ ok: true, value: 1n });
    });

    it('trims surrounding whitespace', () => {
      expect(parseAmountInput('  2 ', USDC_DECIMALS)).toEqual({ ok: true, value: 2_000_000n });
    });
  });

  describe('negative', () => {
    it.each(['', '   '])('rejects empty input %p', (input) => {
      expect(parseAmountInput(input, USDC_DECIMALS)).toEqual({ ok: false, reason: 'empty' });
    });

    it.each(['abc', '1e18', '-1', '+1', '1.000.000', '1,000.5', '0x10', '1 000'])(
      'rejects non-number %p',
      (input) => {
        expect(parseAmountInput(input, USDC_DECIMALS)).toEqual({ ok: false, reason: 'not_a_number' });
      },
    );

    it('rejects more decimals than the token has instead of rounding', () => {
      expect(parseAmountInput('0.0000001', USDC_DECIMALS)).toEqual({
        ok: false,
        reason: 'too_many_decimals',
      });
    });

    it.each(['0', '0.0', '0,000', '.0'])('rejects zero %p', (input) => {
      expect(parseAmountInput(input, USDC_DECIMALS)).toEqual({ ok: false, reason: 'zero' });
    });

    it('rejects values above uint256', () => {
      expect(parseAmountInput((maxUint256 + 1n).toString(), 0)).toEqual({ ok: false, reason: 'overflow' });
    });
  });

  describe('edge case', () => {
    it('treats "1.000" as one, not one thousand', () => {
      expect(parseAmountInput('1.000', USDC_DECIMALS)).toEqual({ ok: true, value: 1_000_000n });
    });

    it('treats "1,000" as one, not one thousand', () => {
      expect(parseAmountInput('1,000', USDC_DECIMALS)).toEqual({ ok: true, value: 1_000_000n });
    });

    it('accepts a trailing separator while the user is still typing', () => {
      expect(parseAmountInput('1.', USDC_DECIMALS)).toEqual({ ok: true, value: 1_000_000n });
    });

    it('accepts a leading separator', () => {
      expect(parseAmountInput('.5', USDC_DECIMALS)).toEqual({ ok: true, value: 500_000n });
    });

    it.each(['.', ','])('rejects a lone separator %p', (input) => {
      expect(parseAmountInput(input, USDC_DECIMALS)).toEqual({ ok: false, reason: 'not_a_number' });
    });

    it('accepts exactly uint256 max', () => {
      expect(parseAmountInput(maxUint256.toString(), 0)).toEqual({ ok: true, value: maxUint256 });
    });

    it('rejects any fraction for a 0-decimal token', () => {
      expect(parseAmountInput('1.5', 0)).toEqual({ ok: false, reason: 'too_many_decimals' });
    });
  });
});
