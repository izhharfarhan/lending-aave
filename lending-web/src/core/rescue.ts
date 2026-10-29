import type { Address } from 'viem';

import type { ChainRead, ChainView, WhitelistAsset } from './chainPosition';
import { panelAssets, panelMax, type MaxInput } from './panel';
import { simulate } from './simulate';

/** Satu pilihan di panel penyelamatan: aset terbaik untuk aksi itu dan HF kalau MAX-nya dijalankan. */
export type RescueChoice = {
  tab: 'repay' | 'supply';
  asset: Address;
  symbol: string;
  decimals: number;
  /** MAX (Q26) aset ini. */
  amount: bigint;
  /** HF sesudah; `null` = utang lunas. */
  healthFactor: number | null;
};

/** `null` = wallet di chain ini nggak punya apa pun yang bisa dipakai untuk aksi itu. */
export type RescueOptions = { repay: RescueChoice | null; supply: RescueChoice | null };

// HF tanpa utang (`null`) = paling aman.
const rank = (healthFactor: number | null) => healthFactor ?? Infinity;

/**
 * Panel penyelamatan (Q29, J3): HF sesudah Repay (MAX repay, Q26) dan Supply jaminan (saldo wallet yang boleh dipakai,
 * = MAX supply), masing-masing dari aset yang paling menaikkan HF. Supply yang nggak jadi jaminan nggak ditawarkan.
 */
export function rescueOptions(read: ChainRead, view: ChainView, whitelist: WhitelistAsset[], input: MaxInput): RescueOptions {
  const healthFactorNow = view.account?.healthFactor ?? null;
  const best = (tab: RescueChoice['tab']): RescueChoice | null => {
    const choices = panelAssets(view, tab).flatMap((row): RescueChoice[] => {
      if (row.paused) return [];
      const amount = panelMax(read, view, whitelist, { ...input, tab, asset: row.asset }) ?? 0n;
      if (amount === 0n) return [];
      const { healthFactor } = simulate(read, whitelist, { action: tab, asset: row.asset, amount }).account;
      if (rank(healthFactor) <= rank(healthFactorNow)) return [];
      return [{ tab, asset: row.asset, symbol: row.symbol, decimals: row.decimals, amount, healthFactor }];
    });
    return choices.reduce<RescueChoice | null>((top, c) => (top && rank(top.healthFactor) >= rank(c.healthFactor) ? top : c), null);
  };
  return { repay: best('repay'), supply: best('supply') };
}
