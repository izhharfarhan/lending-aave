import { elapsed } from './relativeTime';

describe('elapsed()', () => {
  it('rounds down to the largest whole unit', () => {
    expect(elapsed(45)).toEqual({ amount: 45, unit: 'second' });
    expect(elapsed(150)).toEqual({ amount: 2, unit: 'minute' });
    expect(elapsed(2 * 3600 + 100)).toEqual({ amount: 2, unit: 'hour' });
    expect(elapsed(25 * 3600)).toEqual({ amount: 1, unit: 'day' });
  });

  it('never goes negative when the clock is behind', () => {
    expect(elapsed(-5)).toEqual({ amount: 0, unit: 'second' });
  });
});
