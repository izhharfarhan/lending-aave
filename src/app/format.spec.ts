import { hf, usd } from './format';

describe('hf()', () => {
  it('writes HF with two decimals, rounded down so it never looks safer than it is', () => {
    expect(hf(1.996)).toBe('1,99');
    expect(hf(1.3)).toBe('1,30');
  });

  it('caps HF at "> 100": past that the number (e.g. left-over interest dust after a repay) means nothing', () => {
    expect(hf(99.999)).toBe('99,99');
    expect(hf(100)).toBe('> 100');
    expect(hf(1_995_511_856.52)).toBe('> 100');
  });
});

describe('usd()', () => {
  it('writes cents below $100 and whole dollars from there', () => {
    expect(usd(12.345)).toBe('$12,35');
    expect(usd(1_234.5)).toBe('$1.235');
    expect(usd(0)).toBe('$0,00');
  });

  it('writes a positive value too small for cents as "< $0,01", not "$0,00" that reads as empty (dust position)', () => {
    expect(usd(0.00004)).toBe('< $0,01');
    expect(usd(0.0049)).toBe('< $0,01');
    expect(usd(0.005)).toBe('$0,01');
  });

  it('keeps the sign of a tiny negative net', () => {
    expect(usd(-0.00003)).toBe('−< $0,01');
    expect(usd(-12.5)).toBe('−$12,50');
  });
});
