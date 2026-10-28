'use client';

import type { ReactNode } from 'react';

import { supportedChain } from '@/config/chains';
import { explorerTxUrl } from '@/config/explorer';
import { LIQUIDATED } from '@/copy';
import { liquidationFacts, type IndexedLiquidation } from '@/core/liquidation';

import { hf, pct, shortAddress, tokenAmount, usd } from './format';
import type { TokenInfo, TokenLookup } from './useTokenLookup';

/** "400 USDC" dalam token utangnya; token belum terbaca = alamat pendek tanpa jumlah. */
export function deficitAmounts(entry: IndexedLiquidation, tokenOf: TokenLookup): string[] {
  return entry.liquidation.deficits.map(({ debtAsset, amount }) => {
    const token = tokenOf(entry.chainId, debtAsset);
    return token?.decimals != null ? `${tokenAmount(amount, token.decimals)} ${token.symbol}` : (token?.symbol ?? shortAddress(debtAsset));
  });
}

/** "sisa utang 400 USDC dihapus" per aset utang (GLOSSARY "Sisa utang dihapus"); dipakai banner & baris Riwayat. */
export const deficitTexts = (entry: IndexedLiquidation, tokenOf: TokenLookup) => deficitAmounts(entry, tokenOf).map(LIQUIDATED.deficit);

// Rincian satu likuidasi (spec story 103): jaminan dijual, utang dilunasi, penalti, HF sebelum, sisa utang dihapus, tx.
export function LiquidationDetails({ entry, tokenOf }: { entry: IndexedLiquidation; tokenOf: TokenLookup }) {
  const collateral = tokenOf(entry.chainId, entry.reserve);
  const debt = tokenOf(entry.chainId, entry.liquidation.debtAsset);
  // Bacaan chain belum ada (RPC gagal/masih dimuat): jumlah token & USD jadi "—", HF dan tautan tx tetap tampil.
  const facts = liquidationFacts(entry, collateral?.decimals ?? null);
  const inToken = (amount: bigint, token: TokenInfo | null) =>
    token?.decimals != null ? `${tokenAmount(amount, token.decimals)} ${token.symbol}` : LIQUIDATED.unknownAmount;
  const inUsd = (value: number | null) => (value === null ? LIQUIDATED.unknownAmount : usd(value));
  const deficits = deficitTexts(entry, tokenOf);
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Fact label={LIQUIDATED.collateralLost} value={inToken(facts.collateralLost.amount, collateral)} sub={inUsd(facts.collateralLost.usd)} />
      <Fact label={LIQUIDATED.debtRepaid} value={inToken(facts.debtRepaid, debt)} />
      <Fact
        label={LIQUIDATED.penalty}
        value={inToken(facts.penalty.amount, collateral)}
        sub={`${inUsd(facts.penalty.usd)} · ${LIQUIDATED.penaltyPercent(penaltyPercent(facts.penalty.percent))} · ${LIQUIDATED.penaltyNote}`}
      />
      <Fact
        label={LIQUIDATED.hfBefore}
        value={facts.healthFactorBefore === null ? LIQUIDATED.hfUnavailable : `≈ ${hf(facts.healthFactorBefore)}`}
        sub={facts.healthFactorBefore === null ? undefined : LIQUIDATED.hfNote}
      />
      <p className="col-span-full text-xs text-muted">
        {deficits.length > 0 && <span className="mr-3 text-ink">{deficits.join(', ')}</span>}
        <a href={explorerTxUrl(entry.chainId, entry.txHash)} target="_blank" rel="noreferrer" className="link">
          {LIQUIDATED.explorer}
        </a>
        <span className="num ml-2 text-faint">
          {supportedChain(entry.chainId).name} · {shortAddress(entry.txHash)}
        </span>
      </p>
    </dl>
  );
}

// 5% bulat ditulis "5%", tapi bonus 104,5% jangan dibulatkan jadi "5%".
const penaltyPercent = (percent: number) => pct(percent, Number.isInteger(Math.round(percent * 10_000) / 100) ? 0 : 2);

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-ink">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  );
}
