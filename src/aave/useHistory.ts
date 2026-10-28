import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Address } from 'viem';

import { INDEXER_URL } from '@/config/indexer';
import { mergeHistory, type HistoryItem } from '@/core/history';

import { fetchIndexerHistory } from './fetchIndexer';
import { useLocalHistories } from './useLocalHistory';
import type { ChainNetworkStatus } from './useNetworkStatus';

// Selama ada tx yang "menunggu indexer", indexer ditanya ulang segini sekali (pola swap-web). Tx yang sudah lebih
// lama dari `AWAITING_POLL_FOR_SECONDS` (waktu chain, Q30) dan belum juga muncul nggak dipolling lagi, mis. hash sesi
// fork lama sesudah Anvil + database indexer di-reset.
const AWAITING_POLL_MS = 3_000;
const AWAITING_POLL_FOR_SECONDS = 10 * 60;

export type History = {
  /** Riwayat gabungan semua chain, terbaru dulu. */
  items: HistoryItem[];
  /** Fetch riwayat indexer gagal (atau URL kosong): yang tampil cuma riwayat browser ini. */
  indexerFailed: boolean;
  /** Fetch indexer pertama masih jalan. */
  loading: boolean;
};

export function useHistory(wallet: Address | undefined, network: ChainNetworkStatus[] | undefined): History {
  const local = useLocalHistories(wallet);
  const indexer = useQuery({
    queryKey: ['indexerHistory', wallet],
    queryFn: () => fetchIndexerHistory(INDEXER_URL!, wallet!),
    enabled: Boolean(wallet) && INDEXER_URL !== null,
    // Gagal = offline; jangan menunggu 3× retry dulu baru badge muncul.
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (stillAwaiting(mergeHistory(query.state.data ?? [], local), network) ? AWAITING_POLL_MS : false),
  });

  const entries = indexer.data;
  const items = useMemo(() => mergeHistory(entries ?? [], local), [entries, local]);
  return { items, indexerFailed: INDEXER_URL === null || indexer.isError, loading: indexer.isLoading };
}

function stillAwaiting(items: HistoryItem[], network: ChainNetworkStatus[] | undefined): boolean {
  return items.some((item) => {
    if (item.source !== 'local' || !item.awaitingIndexer) return false;
    const head = network?.find((chain) => chain.chainId === item.chainId)?.head;
    return !head || head.timestamp - item.timestamp < AWAITING_POLL_FOR_SECONDS;
  });
}
