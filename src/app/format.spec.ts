import { hf } from './format';

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
