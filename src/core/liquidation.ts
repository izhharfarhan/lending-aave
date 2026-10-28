import { formatUnits } from 'viem';

import type { IndexedHistoryEntry, LiquidationDetail } from './history';

/** Banner likuidasi cuma untuk likuidasi 30 hari terakhir (Q17). */
const LIQUIDATION_BANNER_WINDOW_SECONDS = 30 * 86_400;

export type IndexedLiquidation = IndexedHistoryEntry & { liquidation: LiquidationDetail };

/** Kunci ✕ banner di localStorage (Q17): chain + txHash + logIndex. Hash dikecilkan, sama dengan dedup riwayat. */
export const dismissKey = (entry: Pick<IndexedHistoryEntry, 'chainId' | 'txHash' | 'logIndex'>) =>
  `${entry.chainId}:${entry.txHash.toLowerCase()}:${entry.logIndex}`;

export const isLiquidation = (entry: IndexedHistoryEntry): entry is IndexedLiquidation => entry.kind === 'liquidation' && entry.liquidation !== null;

/**
 * Likuidasi untuk banner dashboard (Q17): belum ditutup di device ini dan paling lama 30 hari menurut timestamp blok
 * terbaru **chain-nya sendiri** (Q30). Blok terbaru chain belum terbaca = umurnya nggak bisa dinilai, jadi nggak
 * ditampilkan. Urutan masukan dipertahankan (riwayat sudah terbaru dulu).
 */
export function bannerLiquidations(
  entries: IndexedHistoryEntry[],
  { latestBlockTimestamp, dismissed }: { latestBlockTimestamp: (chainId: number) => number | null; dismissed: ReadonlySet<string> },
): IndexedLiquidation[] {
  return entries.filter(isLiquidation).filter((entry) => {
    const latest = latestBlockTimestamp(entry.chainId);
    return latest !== null && latest - entry.timestamp <= LIQUIDATION_BANNER_WINDOW_SECONDS && !dismissed.has(dismissKey(entry));
  });
}

/**
 * - `partial`: jaminan reserve itu masih tersisa.
 * - `collateralSold`: jaminan reserve itu habis (jaminan otomatis nonaktif di tx yang sama, V3).
 * - `debtWrittenOff`: seluruh jaminan habis dan sisa utang dihapus (`DeficitCreated`, V5).
 */
export type LiquidationOutcome = 'partial' | 'collateralSold' | 'debtWrittenOff';

export const liquidationOutcome = (entry: IndexedLiquidation): LiquidationOutcome =>
  entry.liquidation.deficits.length > 0 ? 'debtWrittenOff' : entry.collateralEnabled === false ? 'collateralSold' : 'partial';

export type LiquidationFacts = {
  /** Jaminan yang hilang (bagian likuidator + biaya protokol), dalam token jaminan dan USD. USD `null` = desimal token belum diketahui. */
  collateralLost: { amount: bigint; usd: number | null };
  /** Dalam token utang (`debtAsset`). */
  debtRepaid: bigint;
  /**
   * `percent` = bonus − 100%: penalti terhadap nilai utang yang dilunasi (penalti = total − total/bonus, total/bonus ≈
   * nilai utang), sama dengan "Liquidation penalty" di Detail parameter.
   */
  penalty: { amount: bigint; usd: number | null; percent: number };
  /** `null` = tidak tersedia (Q16). */
  healthFactorBefore: number | null;
};

const BPS = 10_000;
// Harga oracle Aave = USD 8 desimal.
const ORACLE_DECIMALS = 8;
const toUsd = (amount: bigint, price: bigint, decimals: number | null) =>
  decimals === null ? null : Number(formatUnits(amount * price, decimals + ORACLE_DECIMALS));

/**
 * Rincian likuidasi (spec story 103, Q16) dari baris indexer. Nilai USD memakai harga oracle di blok likuidasi;
 * `collateralDecimals` `null` (bacaan chain belum ada) = USD belum bisa dihitung, sisanya tetap.
 */
export function liquidationFacts(entry: IndexedLiquidation, collateralDecimals: number | null): LiquidationFacts {
  const detail = entry.liquidation;
  const lost = entry.amount ?? detail.liquidatedCollateralAmount + detail.protocolFee;
  return {
    collateralLost: { amount: lost, usd: toUsd(lost, detail.collateralPrice, collateralDecimals) },
    debtRepaid: detail.debtToCover,
    penalty: {
      amount: detail.penalty,
      usd: toUsd(detail.penalty, detail.collateralPrice, collateralDecimals),
      percent: (detail.liquidationBonus - BPS) / BPS,
    },
    healthFactorBefore: detail.healthFactorBefore === null ? null : Number(formatUnits(detail.healthFactorBefore, 18)),
  };
}
