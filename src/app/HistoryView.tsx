'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { useAccount } from 'wagmi';

import { useHistory } from '@/aave/useHistory';
import { indexerSummaryOf, latestBlockTimestamp, useNetworkStatus, type ChainNetworkStatus } from '@/aave/useNetworkStatus';
import { SUPPORTED_CHAINS, supportedChain } from '@/config/chains';
import { explorerTxUrl } from '@/config/explorer';
import { AGE, HISTORY, LIQUIDATED } from '@/copy';
import { filterHistory, HISTORY_KINDS, type HistoryFilter, type HistoryItem, type HistoryKind } from '@/core/history';
import { isLiquidation, type IndexedLiquidation } from '@/core/liquidation';
import { historyAge } from '@/core/relativeTime';

import { list, shortAddress, tokenAmount } from './format';
import { deficitTexts, LiquidationDetails } from './LiquidationDetails';
import { useTokenLookup, type TokenLookup } from './useTokenLookup';

// Halaman Riwayat (Q18): semua chain satu daftar, terbaru di atas, filter chain + jenis. Indexer + tx lokal digabung
// (`mergeHistory`); badge "Riwayat mungkin belum lengkap" kalau indexer offline atau tertinggal di chain mana pun.
// `initialKind` dari `?jenis=` ("Lihat riwayat" banner likuidasi membuka filter Likuidasi).
export function HistoryView({ initialKind }: { initialKind: HistoryKind | null }) {
  const { address } = useAccount();
  const network = useNetworkStatus().data;
  const history = useHistory(address, network);
  const [filter, setFilter] = useState<HistoryFilter>({ chainId: null, kind: initialKind });
  const tokenOf = useTokenLookup();

  if (!address) return <ConnectPrompt />;

  const items = filterHistory(history.items, filter);
  return (
    <section className="flex flex-col gap-5">
      <IncompleteBadge network={network} indexerFailed={history.indexerFailed} />
      <div className="flex flex-col gap-3 md:flex-row md:gap-8">
        <Chips
          label={HISTORY.filterChain}
          options={SUPPORTED_CHAINS.map((chain) => ({ value: chain.chainId, label: chain.name }))}
          value={filter.chainId}
          onChange={(chainId) => setFilter({ ...filter, chainId })}
        />
        <Chips
          label={HISTORY.filterKind}
          options={HISTORY_KINDS.map((kind) => ({ value: kind, label: HISTORY.kinds[kind] }))}
          value={filter.kind}
          onChange={(kind) => setFilter({ ...filter, kind })}
        />
      </div>
      {history.loading && history.items.length === 0 ? (
        <p className="text-sm text-muted">{HISTORY.loading}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">{history.items.length === 0 ? HISTORY.empty : HISTORY.emptyFiltered}</p>
      ) : (
        <ul className="surface divide-y divide-line">
          {items.map((item) => (
            <HistoryRow key={rowKey(item)} item={item} tokenOf={tokenOf} latest={latestBlockTimestamp(network, item.chainId)} />
          ))}
        </ul>
      )}
    </section>
  );
}

const rowKey = (item: HistoryItem) => `${item.source}:${item.chainId}:${item.txHash}:${item.source === 'indexer' ? item.entry.logIndex : ''}`;

function ConnectPrompt() {
  const { openConnectModal } = useConnectModal();
  return (
    <section className="surface p-5 md:p-8">
      <p className="max-w-sm text-sm text-muted">{HISTORY.connectPrompt(list(SUPPORTED_CHAINS.map((c) => c.name)))}</p>
      <button type="button" className="btn-accent mt-4 px-5 py-2.5" onClick={openConnectModal} disabled={!openConnectModal}>
        {HISTORY.connect}
      </button>
    </section>
  );
}

function IncompleteBadge({ network, indexerFailed }: { network: ChainNetworkStatus[] | undefined; indexerFailed: boolean }) {
  const summary = indexerSummaryOf(network ?? [], { historyFailed: indexerFailed });
  if (summary.kind === 'synced') return null;
  return (
    <div role="status" className="flex flex-col gap-1">
      <span className="badge badge-warn self-start">{HISTORY.incomplete}</span>
      <p className="text-xs text-muted">
        {summary.kind === 'offline'
          ? HISTORY.incompleteDetail.offline
          : HISTORY.incompleteDetail.lagging(list(summary.chains.map((chain) => supportedChain(chain.chainId).name)))}
      </p>
    </div>
  );
}

function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  const chip = (selected: boolean) => `rounded-md px-2.5 py-1 text-sm ${selected ? 'bg-panel-hover text-ink' : 'text-muted hover:text-ink'}`;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-faint">{label}</span>
      <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
        {HISTORY.all}
      </button>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} className={chip(value === option.value)} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function HistoryRow({ item, tokenOf, latest }: { item: HistoryItem; tokenOf: TokenLookup; latest: number | null }) {
  const [open, setOpen] = useState(false);
  const chain = supportedChain(item.chainId);
  const age = historyAge(item.timestamp, latest);
  const liquidation = liquidationOf(item);
  return (
    <li className="px-4 py-3 md:px-5">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-6">
        <span className="w-24 shrink-0 font-medium text-ink">{HISTORY.kinds[item.kind]}</span>
        <span className="min-w-0 flex-1 text-sm text-ink">
          {describe(item, tokenOf)}
          {item.source === 'local' && item.awaitingIndexer && <span className="badge badge-muted ml-2">{HISTORY.awaiting}</span>}
          {item.source === 'local' && item.entry.status === 'failed' && <span className="badge badge-danger ml-2">{HISTORY.failed}</span>}
          {liquidation && (
            <button type="button" className="link ml-2 text-xs text-muted" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? LIQUIDATED.hideDetails : LIQUIDATED.showDetails}
            </button>
          )}
        </span>
        <span className="flex items-center gap-4 text-xs text-muted md:text-sm">
          <span className="w-20">{chain.name}</span>
          <span className="w-36 whitespace-nowrap">{age ? HISTORY.ago(AGE[age.unit](age.amount)) : HISTORY.unknownAge}</span>
          <a href={explorerTxUrl(item.chainId, item.txHash)} target="_blank" rel="noreferrer" className="link" aria-label={HISTORY.explorerAria(chain.name)}>
            {HISTORY.explorer}
          </a>
        </span>
      </div>
      {liquidation && open && (
        <div className="mt-3 border-t border-line pt-3">
          <LiquidationDetails entry={liquidation} tokenOf={tokenOf} />
        </div>
      )}
    </li>
  );
}

const liquidationOf = (item: HistoryItem): IndexedLiquidation | null =>
  item.source === 'indexer' && isLiquidation(item.entry) ? item.entry : null;

// "1 ETH · jaminan aktif" (Q18): jumlah + token, lalu perubahan jaminan kalau ada. Likuidasi: jaminan yang dijual
// (bagian likuidator + biaya protokol) dan "sisa utang <x> dihapus" kalau ada deficit; sisanya di rincian.
function describe(item: HistoryItem, tokenOf: TokenLookup): string {
  const parts: string[] = [];
  if (item.source === 'local') {
    const { symbol, decimals, amount } = item.entry.asset;
    parts.push(item.kind === 'collateral' ? symbol : `${tokenAmount(BigInt(amount), decimals)} ${symbol}`);
  } else {
    const token = tokenOf(item.chainId, item.entry.reserve);
    const symbol = token?.symbol ?? shortAddress(item.entry.reserve);
    const amount = item.entry.amount !== null && token?.decimals != null ? `${tokenAmount(item.entry.amount, token.decimals)} ${symbol}` : symbol;
    parts.push(item.kind === 'liquidation' ? HISTORY.liquidationSold(amount) : item.kind === 'collateral' ? symbol : amount);
    const liquidation = liquidationOf(item);
    if (liquidation) parts.push(...deficitTexts(liquidation, tokenOf));
  }
  if (item.collateralEnabled !== null) parts.push(HISTORY.collateral(item.collateralEnabled));
  return parts.join(' · ');
}

