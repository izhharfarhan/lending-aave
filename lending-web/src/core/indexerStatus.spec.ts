import { indexerChainStatus, indexerSummary } from './indexerStatus';

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

describe('indexerSummary()', () => {
  // Satu ringkasan untuk footer sidebar dan badge "Riwayat mungkin belum lengkap" (Q18).
  it('is synced only when every chain is synced', () => {
    expect(indexerSummary([{ chainId: 1, status: { kind: 'synced' } }, { chainId: 8453, status: { kind: 'synced' } }])).toEqual({ kind: 'synced' });
  });

  it('lists every lagging chain with its gap', () => {
    expect(
      indexerSummary([
        { chainId: 1, status: { kind: 'synced' } },
        { chainId: 8453, status: { kind: 'lagging', blocks: 40n } },
        { chainId: 42161, status: { kind: 'lagging', blocks: null } },
      ]),
    ).toEqual({
      kind: 'lagging',
      chains: [
        { chainId: 8453, blocks: 40n },
        { chainId: 42161, blocks: null },
      ],
    });
  });

  // Indexer yang sama untuk semua chain: offline di satu = offline.
  it('is offline when the indexer is offline, even if another chain looks lagging', () => {
    expect(indexerSummary([{ chainId: 1, status: { kind: 'lagging', blocks: 9n } }, { chainId: 8453, status: { kind: 'offline' } }])).toEqual({ kind: 'offline' });
  });

  // Riwayat gagal diambil walau `_meta` masih menjawab.
  it('is offline when the history itself could not be fetched', () => {
    expect(indexerSummary([{ chainId: 1, status: { kind: 'synced' } }], { historyFailed: true })).toEqual({ kind: 'offline' });
  });
});
