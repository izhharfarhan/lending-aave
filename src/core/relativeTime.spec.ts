import { elapsed, historyAge } from './relativeTime';

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

describe('historyAge()', () => {
  // Q30: dihitung terhadap timestamp blok terbaru chain transaksi itu, bukan jam perangkat.
  it('measures against the latest block of the chain, so "maju waktu" in the fork moves it', () => {
    const tx = 1_793_079_527;
    expect(historyAge(tx, tx + 5 * 60)).toEqual({ amount: 5, unit: 'minute' });
    // +30 hari lewat Dev Tools: blok terbaru melompat, umurnya ikut.
    expect(historyAge(tx, tx + 30 * 86_400 + 5 * 60)).toEqual({ amount: 30, unit: 'day' });
  });

  it('has no age while the latest block of that chain is unknown', () => {
    expect(historyAge(1_793_079_527, null)).toBeNull();
  });

  // Blok terbaru yang dibaca lebih tua dari tx yang baru masuk (bacaan blok belum diperbarui).
  it('reads as just now when the latest block read is older than the tx', () => {
    expect(historyAge(1_793_079_527, 1_793_079_500)).toEqual({ amount: 0, unit: 'second' });
  });
});
