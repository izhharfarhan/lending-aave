'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { useAccount } from 'wagmi';

import { useHistory } from '@/aave/useHistory';
import { latestBlockTimestamp, useNetworkStatus } from '@/aave/useNetworkStatus';
import { supportedChain } from '@/config/chains';
import { LIQUIDATED } from '@/copy';
import { bannerLiquidations, dismissKey, liquidationOutcome, type IndexedLiquidation } from '@/core/liquidation';

import { dateTime, list, shortAddress } from './format';
import { deficitAmounts, LiquidationDetails } from './LiquidationDetails';
import { useTokenLookup, type TokenLookup } from './useTokenLookup';

const DISMISSED_KEY = 'lending-web:dismissedLiquidations';

// Likuidasi yang sudah ditutup (✕) di device ini (Q17). Dibaca sesudah mount: server nggak punya localStorage, dan
// sebelum terbaca banner nggak ditampilkan supaya yang sudah ditutup nggak berkedip muncul. Storage diblokir = nggak
// diingat, banner tetap bisa ditutup untuk sesi ini.
function useDismissed() {
  const [dismissed, setDismissed] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    // Isi rusak (bukan JSON / bukan array) = belum ada yang ditutup; dashboard jangan sampai crash.
    let stored: unknown = [];
    try {
      stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    } catch {}
    setDismissed(new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : []));
  }, []);
  const dismiss = useCallback((keys: string[]) => {
    setDismissed((current) => {
      const next = new Set([...(current ?? []), ...keys]);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);
  return { dismissed, dismiss };
}

/** Likuidasi untuk banner dashboard + aksi ✕. Kosong selama wallet, status jaringan, atau daftar ✕ belum siap. */
export function useLiquidationBanner() {
  const { address } = useAccount();
  const network = useNetworkStatus().data;
  const history = useHistory(address, network);
  const { dismissed, dismiss } = useDismissed();
  const liquidations =
    address && dismissed
      ? bannerLiquidations(
          history.items.flatMap((item) => (item.source === 'indexer' ? [item.entry] : [])),
          { latestBlockTimestamp: (chainId) => latestBlockTimestamp(network, chainId), dismissed },
        )
      : [];
  return { liquidations, dismiss: () => dismiss(liquidations.map(dismissKey)) };
}

// Banner likuidasi (Q17) di bawah banner Bahaya. Satu likuidasi: kalimat + "Apa yang terjadi?" membuka rinciannya.
// Lebih dari satu: satu banner gabungan + "Lihat riwayat" (Riwayat terfilter ke Likuidasi). ✕ menutup semua yang tampil.
export function LiquidationBanner({ liquidations, onDismiss }: { liquidations: IndexedLiquidation[]; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const tokenOf = useTokenLookup();
  const [first] = liquidations;
  if (!first) return null;
  const single = liquidations.length === 1;
  const chains = [...new Set(liquidations.map((entry) => supportedChain(entry.chainId).name))];

  return (
    <div className="bg-warn-soft px-5 py-3 text-sm">
      <div className="flex items-start gap-4">
        <span className="display mt-0.5 text-xs font-medium tracking-wide text-warn">{LIQUIDATED.tag}</span>
        <p className="flex-1">
          <span className="text-warn">
            {single ? LIQUIDATED.one(supportedChain(first.chainId).name, dateTime(first.timestamp)) : LIQUIDATED.many(liquidations.length, list(chains))}
          </span>{' '}
          {single ? (
            <>
              <span className="text-ink/80">{outcomeText(first, tokenOf)}</span>{' '}
              <button type="button" className="link text-ink" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {open ? LIQUIDATED.hideDetails : LIQUIDATED.showDetails}
              </button>
            </>
          ) : (
            <Link href="/riwayat?jenis=liquidation" className="link text-ink">
              {LIQUIDATED.viewHistory}
            </Link>
          )}
        </p>
        <button type="button" aria-label={LIQUIDATED.dismiss} className="text-muted hover:text-ink" onClick={onDismiss}>
          ✕
        </button>
      </div>
      {single && open && (
        <div className="mt-3 border-t border-line pt-3">
          <LiquidationDetails entry={first} tokenOf={tokenOf} />
        </div>
      )}
    </div>
  );
}

function outcomeText(entry: IndexedLiquidation, tokenOf: TokenLookup): string {
  const symbolOf = (asset: Address) => tokenOf(entry.chainId, asset)?.symbol ?? shortAddress(asset);
  switch (liquidationOutcome(entry)) {
    case 'partial':
      return LIQUIDATED.outcome.partial;
    case 'debtRepaid':
      return LIQUIDATED.outcome.debtRepaid(symbolOf(entry.liquidation.debtAsset), symbolOf(entry.reserve));
    case 'collateralSold':
      return LIQUIDATED.outcome.collateralSold(symbolOf(entry.reserve));
    case 'debtWrittenOff':
      return LIQUIDATED.outcome.debtWrittenOff(list(deficitAmounts(entry, tokenOf)));
  }
}
