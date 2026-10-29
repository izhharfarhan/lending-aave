import type { Address } from 'viem';

import { baseToUsd, debtBalance, type ChainRead, type WhitelistAsset } from './chainPosition';

/** Satu baris "Detail parameter <chain>" (Q7): parameter reserve level pool, bukan nilai efektif E-Mode user. */
export type ReserveParameters = {
  asset: Address;
  symbol: string;
  /** Pecahan, mis. 0,805 = 80,5%. */
  ltv: number;
  liquidationThreshold: number;
  /** Bonus likuidator dari jaminan yang dijual: `liquidationBonus` − 100%. `null` = bukan jaminan (bonus 0). */
  liquidationPenalty: number | null;
  /** Total utang ÷ (total utang + likuiditas pool), cara app.aave.com (v3 memakai `virtualUnderlyingBalance`). */
  utilization: number;
  reserveFactor: number;
  /** Token utuh; `null` = tanpa batas (cap 0). */
  supplyCap: bigint | null;
  borrowCap: bigint | null;
  /** Harga oracle Aave dalam USD. */
  priceUsd: number;
  aToken: Address;
};

const BPS = 10_000;
const fraction = (bps: bigint) => Number(bps) / BPS;
const cap = (value: bigint) => (value === 0n ? null : value);

/** Parameter reserve aset whitelist, urut whitelist; aset tanpa reserve di chain ini dilewati. */
export function reserveParameters(read: ChainRead, whitelist: WhitelistAsset[]): ReserveParameters[] {
  const toUsd = baseToUsd(read.baseCurrency);
  return whitelist.flatMap((asset) => {
    const reserve = read.reserves.find((r) => r.underlyingAsset.toLowerCase() === asset.address.toLowerCase());
    if (!reserve) return [];
    const debt = debtBalance(reserve.totalScaledVariableDebt, reserve, read.blockTimestamp);
    const total = debt + reserve.virtualUnderlyingBalance;
    return [
      {
        asset: reserve.underlyingAsset,
        symbol: asset.symbol,
        ltv: fraction(reserve.baseLTVasCollateral),
        liquidationThreshold: fraction(reserve.reserveLiquidationThreshold),
        liquidationPenalty: reserve.reserveLiquidationBonus === 0n ? null : fraction(reserve.reserveLiquidationBonus - BigInt(BPS)),
        utilization: total === 0n ? 0 : Number(debt) / Number(total),
        reserveFactor: fraction(reserve.reserveFactor),
        supplyCap: cap(reserve.supplyCap),
        borrowCap: cap(reserve.borrowCap),
        priceUsd: toUsd(reserve.priceInMarketReferenceCurrency),
        aToken: reserve.aTokenAddress,
      },
    ];
  });
}
