import { useQuery } from '@tanstack/react-query';
import { useConfig } from 'wagmi';
import { getPublicClient } from 'wagmi/actions';

import { SUPPORTED_CHAINS } from '@/config/chains';
import { INDEXER_URL } from '@/config/indexer';
import { indexerChainStatus, indexerSummary, type IndexerChainStatus } from '@/core/indexerStatus';

import { fetchIndexedBlocks } from './fetchIndexer';

export type ChainNetworkStatus = {
  chainId: number;
  /** Blok terbaru dari RPC app; `null` = RPC gagal. `timestamp` = acuan waktu relatif riwayat chain ini (Q30). */
  head: { number: bigint; timestamp: number } | null;
  indexer: IndexerChainStatus;
};

/**
 * Footer sidebar (spec story 114) dan badge Riwayat: head tiap chain + blok indexer, dibaca dalam satu query supaya
 * selisihnya jujur (pola swap-web: kalau head di-watch terpisah, badge "tertinggal" nyala sendiri di antara dua fetch
 * indexer). RPC gagal = "RPC gagal" di chain itu, bukan indexer offline. Dev Tools meng-invalidate semua query sesudah
 * aksinya, jadi "maju waktu" langsung terbaca.
 */
export function useNetworkStatus() {
  const config = useConfig();
  return useQuery({
    queryKey: ['networkStatus'],
    queryFn: async (): Promise<ChainNetworkStatus[]> => {
      const [indexed, ...heads] = await Promise.all([
        INDEXER_URL === null ? Promise.resolve(null) : fetchIndexedBlocks(INDEXER_URL).catch(() => null),
        ...SUPPORTED_CHAINS.map((chain) =>
          getPublicClient(config, { chainId: chain.chainId })!
            .getBlock({ blockTag: 'latest' })
            .then((block) => ({ number: block.number, timestamp: Number(block.timestamp) }))
            .catch(() => null),
        ),
      ]);
      return SUPPORTED_CHAINS.map((chain, i) => {
        const head = heads[i] ?? null;
        const indexer = indexerChainStatus({
          online: indexed !== null,
          indexedBlock: indexed?.get(chain.chainId) ?? null,
          headBlock: head?.number ?? null,
          maxLagBlocks: chain.indexerMaxLagBlocks,
        });
        return { chainId: chain.chainId, head, indexer };
      });
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Timestamp blok terbaru chain itu (acuan waktu relatif, Q30); `null` = belum terbaca atau RPC gagal. */
export const latestBlockTimestamp = (network: ChainNetworkStatus[] | undefined, chainId: number) =>
  network?.find((chain) => chain.chainId === chainId)?.head?.timestamp ?? null;

/** Ringkasan indexer semua chain untuk footer dan badge Riwayat. */
export const indexerSummaryOf = (network: ChainNetworkStatus[], options?: { historyFailed?: boolean }) =>
  indexerSummary(network.map((chain) => ({ chainId: chain.chainId, status: chain.indexer })), options);
