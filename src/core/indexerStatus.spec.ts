import { historyMayBeIncomplete, indexerChainStatus } from './indexerStatus';

const health = (overrides: Partial<Parameters<typeof indexerChainStatus>[0]> = {}) => ({
  online: true,
  indexedBlock: 26_282_010n,
  headBlock: 26_282_010n,
  maxLagBlocks: 5,
  ...overrides,
});

describe('indexerChainStatus()', () => {
  describe('positive', () => {
    it('is synced at the head, within the allowed lag, and when the indexer is ahead of the app RPC', () => {
      expect(indexerChainStatus(health())).toEqual({ kind: 'synced' });
      expect(indexerChainStatus(health({ headBlock: 26_282_015n }))).toEqual({ kind: 'synced' });
      expect(indexerChainStatus(health({ headBlock: 26_282_000n }))).toEqual({ kind: 'synced' });
    });

    // Footer sidebar: "tertinggal N blok" (spec story 114).
    it('reports how many blocks the indexer is behind once past the allowed lag', () => {
      expect(indexerChainStatus(health({ headBlock: 26_282_044n }))).toEqual({ kind: 'lagging', blocks: 34n });
    });
  });

  describe('negative', () => {
    it('is offline when the indexer does not answer, whatever the blocks say', () => {
      expect(indexerChainStatus(health({ online: false, indexedBlock: null }))).toEqual({ kind: 'offline' });
    });

    // Chain belum ada di `_meta` = indexer belum mulai mencatat chain itu.
    it('is lagging without a count when the chain is missing from the indexer status', () => {
      expect(indexerChainStatus(health({ indexedBlock: null }))).toEqual({ kind: 'lagging', blocks: null });
    });
  });

  describe('edge cases', () => {
    // RPC app gagal: nggak ada pembanding, jangan menuduh indexer tertinggal.
    it('does not judge the lag while the head block is unknown', () => {
      expect(indexerChainStatus(health({ headBlock: null }))).toEqual({ kind: 'synced' });
    });
  });
});

describe('historyMayBeIncomplete()', () => {
  it('flags the history once any chain is offline or lagging', () => {
    expect(historyMayBeIncomplete([{ kind: 'synced' }, { kind: 'synced' }])).toBe(false);
    expect(historyMayBeIncomplete([{ kind: 'synced' }, { kind: 'lagging', blocks: 40n }])).toBe(true);
    expect(historyMayBeIncomplete([{ kind: 'offline' }])).toBe(true);
  });
});
