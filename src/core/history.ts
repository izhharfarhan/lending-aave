import type { Address, Hash } from 'viem';

import type { LocalTxEntry } from './localHistory';

/** Jenis baris riwayat, urutan filter Q18 (Supply/Withdraw/Borrow/Repay/Likuidasi/Collateral). */
export const HISTORY_KINDS = ['supply', 'withdraw', 'borrow', 'repay', 'liquidation', 'collateral'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

/** Rincian likuidasi dari indexer (tiket 21, V5/Q16); dipakai banner & rincian tiket 23. Jumlah mentah per token. */
export type LiquidationDetail = {
  debtAsset: Address;
  /** Utang yang benar-benar dilunasi. */
  debtToCover: bigint;
  /** Jaminan yang diterima likuidator saja. */
  liquidatedCollateralAmount: bigint;
  protocolFee: bigint;
  /** Basis poin, 10.500 = 105%. */
  liquidationBonus: number;
  bonusFromEMode: boolean;
  eModeCategory: number;
  /** Dalam token jaminan. */
  penalty: bigint;
  /** Harga oracle jaminan di blok likuidasi, USD 8 desimal. */
  collateralPrice: bigint;
  /** 1e18 = 1,0; `null` = tidak tersedia (Q16). */
  healthFactorBefore: bigint | null;
  /** Utang user di reserve utang itu sesudah likuidasi (dibaca di blok likuidasi); 0 = lunas. */
  debtRemaining: bigint;
  /** Sisa utang yang dihapus (`DeficitCreated`). */
  deficits: { debtAsset: Address; amount: bigint }[];
};

/** Satu baris `position_event` indexer, sesudah diubah dari string GraphQL. Alamat huruf kecil (Ponder). */
export type IndexedHistoryEntry = {
  chainId: number;
  txHash: Hash;
  logIndex: number;
  kind: HistoryKind;
  reserve: Address;
  /** `null` cuma untuk baris collateral. Di baris likuidasi = jaminan yang hilang (bagian likuidator + fee). */
  amount: bigint | null;
  /** Jaminan yang berubah di baris ini (event otomatis yang digabung, atau arah toggle manual); `null` = tetap. */
  collateralEnabled: boolean | null;
  /** Detik, timestamp blok. */
  timestamp: number;
  blockNumber: bigint;
  liquidation: LiquidationDetail | null;
};

// Bentuk GraphQL indexer: BigInt dikirim sebagai string.
export type RawLiquidation = {
  debtAsset: Address;
  debtToCover: string;
  liquidatedCollateralAmount: string;
  protocolFee: string;
  liquidationBonus: number;
  bonusFromEMode: boolean;
  eModeCategory: number;
  penalty: string;
  collateralPrice: string;
  healthFactorBefore: string | null;
  debtRemaining: string;
  deficitAssets: Address[];
  deficitAmounts: string[];
};
export type RawPositionEvent = {
  chainId: number;
  txHash: Hash;
  logIndex: number;
  kind: HistoryKind;
  reserve: Address;
  amount: string | null;
  collateralEnabled: boolean | null;
  timestamp: string;
  blockNumber: string;
  liquidation: RawLiquidation | null;
};

export function toIndexedEntry(raw: RawPositionEvent): IndexedHistoryEntry {
  return {
    chainId: raw.chainId,
    txHash: raw.txHash,
    logIndex: raw.logIndex,
    kind: raw.kind,
    reserve: raw.reserve,
    amount: raw.amount === null ? null : BigInt(raw.amount),
    collateralEnabled: raw.collateralEnabled,
    timestamp: Number(raw.timestamp),
    blockNumber: BigInt(raw.blockNumber),
    liquidation: raw.liquidation && toLiquidation(raw.liquidation),
  };
}

function toLiquidation(raw: RawLiquidation): LiquidationDetail {
  return {
    debtAsset: raw.debtAsset,
    debtToCover: BigInt(raw.debtToCover),
    liquidatedCollateralAmount: BigInt(raw.liquidatedCollateralAmount),
    protocolFee: BigInt(raw.protocolFee),
    liquidationBonus: raw.liquidationBonus,
    bonusFromEMode: raw.bonusFromEMode,
    eModeCategory: raw.eModeCategory,
    penalty: BigInt(raw.penalty),
    collateralPrice: BigInt(raw.collateralPrice),
    healthFactorBefore: raw.healthFactorBefore === null ? null : BigInt(raw.healthFactorBefore),
    debtRemaining: BigInt(raw.debtRemaining),
    deficits: raw.deficitAssets.map((debtAsset, i) => ({ debtAsset, amount: BigInt(raw.deficitAmounts[i]!) })),
  };
}

// Field yang sama untuk dua sumber: dipakai filter, urutan, dan tampilan.
type HistoryItemBase = { chainId: number; txHash: Hash; timestamp: number; kind: HistoryKind; collateralEnabled: boolean | null };

export type HistoryItem =
  | (HistoryItemBase & { source: 'indexer'; entry: IndexedHistoryEntry })
  /** `awaitingIndexer`: sukses di chain tapi belum muncul di indexer ("menunggu indexer"). */
  | (HistoryItemBase & { source: 'local'; entry: LocalTxEntry; awaitingIndexer: boolean });

// Jenis lokal → jenis riwayat; toggle jaminan membawa arahnya.
const LOCAL_KIND: Record<LocalTxEntry['kind'], { kind: HistoryKind; collateralEnabled: boolean | null }> = {
  supply: { kind: 'supply', collateralEnabled: null },
  withdraw: { kind: 'withdraw', collateralEnabled: null },
  borrow: { kind: 'borrow', collateralEnabled: null },
  repay: { kind: 'repay', collateralEnabled: null },
  collateralOn: { kind: 'collateral', collateralEnabled: true },
  collateralOff: { kind: 'collateral', collateralEnabled: false },
};

const txKey = (chainId: number, hash: string) => `${chainId}:${hash.toLowerCase()}`;

/**
 * Riwayat = baris indexer + tx lokal dari app ini (spec "Riwayat", pola Q17 swap): indexer sumber kebenaran, tx lokal
 * dibuang kalau chain + txHash-nya (tanpa peduli huruf besar-kecil) sudah ada di indexer. Tx lokal yang sukses tapi
 * belum ada = "menunggu indexer"; yang gagal (revert, nggak ada event) tetap tampil tanpa menunggu.
 *
 * Terbaru dulu menurut timestamp blok (dua sumber sama-sama memakainya, Q30); seri → lokal dulu (belum di-index =
 * kemungkinan lebih baru) → sesama indexer di chain yang sama: blok lalu logIndex. Nomor blok antar chain nggak
 * sebanding, jadi selain itu urutan masukan dipertahankan.
 */
export function mergeHistory(indexed: IndexedHistoryEntry[], local: LocalTxEntry[]): HistoryItem[] {
  const indexedTxs = new Set(indexed.map((entry) => txKey(entry.chainId, entry.txHash)));
  const items: HistoryItem[] = indexed.map((entry) => ({
    source: 'indexer',
    chainId: entry.chainId,
    txHash: entry.txHash,
    timestamp: entry.timestamp,
    kind: entry.kind,
    collateralEnabled: entry.collateralEnabled,
    entry,
  }));
  for (const entry of local) {
    if (indexedTxs.has(txKey(entry.chainId, entry.hash))) continue;
    items.push({
      source: 'local',
      chainId: entry.chainId,
      txHash: entry.hash,
      timestamp: entry.blockTimestamp,
      ...LOCAL_KIND[entry.kind],
      entry,
      awaitingIndexer: entry.status === 'confirmed',
    });
  }
  return items.sort(newestFirst);
}

function newestFirst(a: HistoryItem, b: HistoryItem): number {
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
  if (a.source !== b.source) return a.source === 'local' ? -1 : 1;
  if (a.source === 'local' || b.source === 'local' || a.chainId !== b.chainId) return 0;
  if (a.entry.blockNumber !== b.entry.blockNumber) return a.entry.blockNumber > b.entry.blockNumber ? -1 : 1;
  return b.entry.logIndex - a.entry.logIndex;
}

/**
 * Aset baris riwayat untuk logo token (tiket 27): indexer selalu punya `reserve`; tx lokal cuma kalau disimpan sesudah
 * tiket 27. `null` = entri lama yang cuma punya simbol, tampil inisial (alamat sengaja nggak ditebak dari simbol).
 */
export const historyAsset = (item: HistoryItem): Address | null =>
  item.source === 'indexer' ? item.entry.reserve : (item.entry.asset.address ?? null);

export type HistoryFilter = { chainId: number | null; kind: HistoryKind | null };

/** Filter chain + jenis halaman Riwayat (Q18); `null` = semua. */
export function filterHistory(items: HistoryItem[], { chainId, kind }: HistoryFilter): HistoryItem[] {
  return items.filter((item) => (chainId === null || item.chainId === chainId) && (kind === null || item.kind === kind));
}
