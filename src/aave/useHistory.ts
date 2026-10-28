import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Address } from 'viem';

import { INDEXER_URL } from '@/config/indexer';
import { mergeHistory, type HistoryItem } from '@/core/history';

import { fetchIndexerHistory } from './fetchIndexer';
import { useLocalHistories } from './useLocalHistory';
import { latestBlockTimestamp, type ChainNetworkStatus } from './useNetworkStatus';

// Selama ada tx yang "menunggu indexer", indexer ditanya ulang segini sekali (pola swap-web). Tx yang sudah lebih
// lama dari `AWAITING_POLL_FOR_SECONDS` (waktu chain, Q30) dan belum juga muncul nggak dipolling lagi, mis. hash sesi
// fork lama sesudah Anvil + database indexer di-reset. Blok terbaru chain-nya belum terbaca (RPC gagal, status belum
// dimuat) = umurnya nggak bisa dinilai: tetap ditanya, tapi pelan.
const AWAITING_POLL_MS = 3_000;
const AWAITING_POLL_UNKNOWN_AGE_MS = 15_000;
const AWAITING_POLL_FOR_SECONDS = 10 * 60;
// Di luar itu tetap ditanya berkala, seirama bacaan chain dashboard: likuidasi oleh pihak lain (banner, Q17) nggak
// pernah jadi tx lokal, jadi tanpa ini baru muncul sesudah reload atau fokus tab.
const BACKGROUND_POLL_MS = 30_000;

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
    refetchInterval: (query) => pollInterval(mergeHistory(query.state.data ?? [], local), network),
  });

  const entries = indexer.data;
  const items = useMemo(() => mergeHistory(entries ?? [], local), [entries, local]);
  return { items, indexerFailed: INDEXER_URL === null || indexer.isError, loading: indexer.isLoading };
}

function pollInterval(items: HistoryItem[], network: ChainNetworkStatus[] | undefined): number {
  const awaiting = items.filter((item) => item.source === 'local' && item.awaitingIndexer);
  const latest = awaiting.map((item) => ({ item, latest: latestBlockTimestamp(network, item.chainId) }));
  if (latest.some(({ item, latest }) => latest !== null && latest - item.timestamp < AWAITING_POLL_FOR_SECONDS)) return AWAITING_POLL_MS;
  return latest.some(({ latest }) => latest === null) ? AWAITING_POLL_UNKNOWN_AGE_MS : BACKGROUND_POLL_MS;
}
