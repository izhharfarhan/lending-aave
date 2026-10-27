import { addEntry, localHistoryKey, parseHistory, type LocalTxEntry } from './localHistory';

const entry = (hash: `0x${string}`, overrides: Partial<LocalTxEntry> = {}): LocalTxEntry => ({
  hash,
  chainId: 1,
  kind: 'supply',
  status: 'confirmed',
  blockTimestamp: 1_793_079_527,
  asset: { symbol: 'USDC', decimals: 6, amount: '1000000000' },
  ...overrides,
});

describe('local history', () => {
  describe('positive', () => {
    it('keys history per mode, chain and wallet, so fork txs never show up on mainnet', () => {
      expect(localHistoryKey('fork', 1, '0xABC')).toBe('lending-web:history:fork:1:0xabc');
      expect(localHistoryKey('fork', 1, '0xabc')).not.toBe(localHistoryKey('mainnet', 1, '0xabc'));
    });

    it('puts the newest tx first and replaces an entry with the same hash instead of doubling it', () => {
      const older = [entry('0x01'), entry('0x02')];

      expect(addEntry(older, entry('0x03')).map((e) => e.hash)).toEqual(['0x03', '0x01', '0x02']);
      expect(addEntry(older, entry('0x02', { status: 'failed' }))).toEqual([entry('0x02', { status: 'failed' }), entry('0x01')]);
    });

    it('reads back what it stored', () => {
      const stored = [entry('0x01', { status: 'failed' })];

      expect(parseHistory(JSON.stringify(stored))).toEqual(stored);
    });
  });

  describe('negative', () => {
    it('starts empty from missing or corrupt storage instead of crashing the page', () => {
      expect(parseHistory(null)).toEqual([]);
      expect(parseHistory('{not json')).toEqual([]);
      expect(parseHistory('{"hash":"0x01"}')).toEqual([]);
    });
  });

  describe('edge case', () => {
    it('drops entries with an unknown shape but keeps the valid ones', () => {
      // Approve bukan jenis riwayat (nggak pernah ada pasangannya di indexer), begitu juga bentuk lama `sentAtMs`.
      const text = JSON.stringify([entry('0x01'), { ...entry('0x02'), kind: 'approve' }, { ...entry('0x03'), blockTimestamp: undefined, sentAtMs: 1 }, null]);

      expect(parseHistory(text)).toEqual([entry('0x01')]);
    });
  });
});
