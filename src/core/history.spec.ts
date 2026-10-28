import type { Address, Hash } from 'viem';

import { filterHistory, mergeHistory, toIndexedEntry, type IndexedHistoryEntry, type RawPositionEvent } from './history';
import type { LocalTxEntry } from './localHistory';

const WETH: Address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC: Address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const T = 1_793_079_527;

const raw = (overrides: Partial<RawPositionEvent> = {}): RawPositionEvent => ({
  chainId: 1,
  txHash: '0x70753e7ec2947d49c42c9d80bc854217bc524b99974bbf27cdcaa819d312f074',
  logIndex: 6,
  kind: 'supply',
  reserve: WETH,
  amount: '1000000000000000000',
  collateralEnabled: true,
  timestamp: String(T),
  blockNumber: '26282004',
  liquidation: null,
  ...overrides,
});

const indexed = (txHash: Hash, overrides: Partial<IndexedHistoryEntry> = {}): IndexedHistoryEntry => ({
  ...toIndexedEntry(raw({ txHash })),
  ...overrides,
});

const local = (hash: Hash, overrides: Partial<LocalTxEntry> = {}): LocalTxEntry => ({
  hash,
  chainId: 1,
  kind: 'supply',
  status: 'confirmed',
  blockTimestamp: T,
  asset: { symbol: 'USDC', decimals: 6, amount: '1000000000' },
  ...overrides,
});

describe('toIndexedEntry()', () => {
  it('turns the GraphQL strings of a history row into numbers and bigints', () => {
    expect(toIndexedEntry(raw())).toEqual({
      chainId: 1,
      txHash: '0x70753e7ec2947d49c42c9d80bc854217bc524b99974bbf27cdcaa819d312f074',
      logIndex: 6,
      kind: 'supply',
      reserve: WETH,
      amount: 1_000_000_000_000_000_000n,
      collateralEnabled: true,
      timestamp: T,
      blockNumber: 26_282_004n,
      liquidation: null,
    });
  });

  it('keeps a manual collateral toggle without an amount', () => {
    expect(toIndexedEntry(raw({ kind: 'collateral', amount: null, collateralEnabled: false }))).toMatchObject({ kind: 'collateral', amount: null, collateralEnabled: false });
  });

  // Tiket 21: rincian likuidasi lewat relasi `positionEvent.liquidation`; deficit berpasangan per indeks.
  it('pairs the liquidation deficits and keeps an unavailable health factor as null', () => {
    const liquidation = {
      debtAsset: USDC,
      debtToCover: '1047832271',
      liquidatedCollateralAmount: '990476190476190475',
      protocolFee: '9523809523809524',
      liquidationBonus: 10_500,
      bonusFromEMode: false,
      eModeCategory: 0,
      penalty: '47619047619047620',
      collateralPrice: '110000000000',
      healthFactorBefore: null,
      deficitAssets: [USDC],
      deficitAmounts: ['352167730'],
    };

    expect(toIndexedEntry(raw({ kind: 'liquidation', collateralEnabled: false, liquidation })).liquidation).toEqual({
      debtAsset: USDC,
      debtToCover: 1_047_832_271n,
      liquidatedCollateralAmount: 990_476_190_476_190_475n,
      protocolFee: 9_523_809_523_809_524n,
      liquidationBonus: 10_500,
      bonusFromEMode: false,
      eModeCategory: 0,
      penalty: 47_619_047_619_047_620n,
      collateralPrice: 110_000_000_000n,
      healthFactorBefore: null,
      deficits: [{ debtAsset: USDC, amount: 352_167_730n }],
    });
  });
});

describe('mergeHistory()', () => {
  describe('positive', () => {
    // Pola Q17 swap: indexer sumber kebenaran, dedup per txHash tanpa peduli huruf besar-kecil.
    it('drops a local tx once the indexer has it, keeping the indexer row', () => {
      const items = mergeHistory([indexed('0xaa')], [local('0xAA')]);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ source: 'indexer', txHash: '0xaa' });
    });

    // Spec story 110: tx yang baru dikirim langsung muncul walau indexer belum menyusul.
    it('shows a confirmed local tx the indexer has not seen yet as awaiting the indexer', () => {
      expect(mergeHistory([], [local('0xbb')])).toEqual([
        expect.objectContaining({ source: 'local', chainId: 1, txHash: '0xbb', kind: 'supply', timestamp: T, awaitingIndexer: true }),
      ]);
    });

    it('maps local collateral toggles to collateral rows with their direction', () => {
      const items = mergeHistory([], [local('0x01', { kind: 'collateralOn' }), local('0x02', { kind: 'collateralOff', blockTimestamp: T - 1 })]);

      expect(items.map((item) => [item.kind, item.collateralEnabled])).toEqual([
        ['collateral', true],
        ['collateral', false],
      ]);
    });

    // Q18: semua chain satu daftar, terbaru di atas, diurutkan timestamp blok (nomor blok antar chain nggak sebanding).
    it('lists all chains newest first by block timestamp', () => {
      const items = mergeHistory(
        [indexed('0x01', { chainId: 1, timestamp: T - 60, blockNumber: 26_282_100n }), indexed('0x02', { chainId: 42161, timestamp: T, blockNumber: 517_470_003n })],
        [local('0x03', { chainId: 8453, blockTimestamp: T - 30 })],
      );

      expect(items.map((item) => item.txHash)).toEqual(['0x02', '0x03', '0x01']);
    });
  });

  describe('negative', () => {
    // Revert = nggak ada event, jadi nggak akan pernah muncul di indexer.
    it('keeps a failed local tx without waiting for the indexer', () => {
      expect(mergeHistory([], [local('0xcc', { status: 'failed' })])[0]).toMatchObject({ source: 'local', awaitingIndexer: false });
    });

    it('does not drop a local tx because the same hash exists on another chain', () => {
      expect(mergeHistory([indexed('0xaa', { chainId: 8453 })], [local('0xaa', { chainId: 1 })])).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('breaks ties local first, then by block and log index within a chain', () => {
      const items = mergeHistory(
        [indexed('0x01', { blockNumber: 10n, logIndex: 1 }), indexed('0x02', { blockNumber: 11n, logIndex: 0 }), indexed('0x02', { blockNumber: 11n, logIndex: 4, kind: 'borrow' })],
        [local('0x03')],
      );

      expect(items.map((item) => [item.txHash, item.kind])).toEqual([
        ['0x03', 'supply'],
        ['0x02', 'borrow'],
        ['0x02', 'supply'],
        ['0x01', 'supply'],
      ]);
    });
  });
});

describe('filterHistory()', () => {
  const items = mergeHistory(
    [indexed('0x01', { chainId: 1, kind: 'liquidation' }), indexed('0x02', { chainId: 8453, kind: 'supply' })],
    [local('0x03', { chainId: 8453, kind: 'collateralOff' })],
  );

  // Q18: filter chain + jenis; `null` = semua.
  it('filters by chain and by kind, and shows everything without a filter', () => {
    expect(filterHistory(items, { chainId: null, kind: null })).toHaveLength(3);
    // Timestamp sama: tx lokal di atas (aturan seri `mergeHistory`).
    expect(filterHistory(items, { chainId: 8453, kind: null }).map((item) => item.txHash)).toEqual(['0x03', '0x02']);
    expect(filterHistory(items, { chainId: null, kind: 'liquidation' }).map((item) => item.txHash)).toEqual(['0x01']);
    expect(filterHistory(items, { chainId: 8453, kind: 'collateral' }).map((item) => item.txHash)).toEqual(['0x03']);
  });
});
