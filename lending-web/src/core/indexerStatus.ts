/** Status indexer untuk satu chain (footer sidebar, spec story 114): sinkron / tertinggal N blok / offline. */
export type IndexerChainStatus = { kind: 'synced' } | { kind: 'lagging'; blocks: bigint | null } | { kind: 'offline' };

export type IndexerChainHealth = {
  /** `/graphql` indexer menjawab. */
  online: boolean;
  /** Blok terakhir yang di-index chain ini (`_meta.status`); `null` = chain ini belum ada di sana. */
  indexedBlock: bigint | null;
  /** Head chain dari RPC app; `null` = belum terbaca (lag nggak bisa dinilai). */
  headBlock: bigint | null;
  maxLagBlocks: number;
};

/**
 * Pola `indexerBadge` swap-web (Q18): offline > tertinggal. Tertinggal = head − blok indexer > `maxLagBlocks` (diukur
 * blok, bukan waktu: di fork automine blok sebelumnya bisa berjam-jam lalu), atau chain ini belum ada di `_meta`
 * (`blocks` = null). Indexer di depan RPC app bukan tertinggal; head yang belum terbaca nggak dinilai.
 */
export function indexerChainStatus({ online, indexedBlock, headBlock, maxLagBlocks }: IndexerChainHealth): IndexerChainStatus {
  if (!online) return { kind: 'offline' };
  if (indexedBlock === null) return { kind: 'lagging', blocks: null };
  if (headBlock === null) return { kind: 'synced' };
  const behind = headBlock - indexedBlock;
  return behind > BigInt(maxLagBlocks) ? { kind: 'lagging', blocks: behind } : { kind: 'synced' };
}

export type IndexerSummary =
  | { kind: 'synced' }
  | { kind: 'offline' }
  | { kind: 'lagging'; chains: { chainId: number; blocks: bigint | null }[] };

/**
 * Satu ringkasan untuk footer sidebar dan badge "Riwayat mungkin belum lengkap" (Q18): offline (indexer yang sama untuk
 * semua chain, atau riwayatnya sendiri gagal diambil) > tertinggal (semua chain yang tertinggal) > sinkron.
 */
export function indexerSummary(chains: { chainId: number; status: IndexerChainStatus }[], { historyFailed = false } = {}): IndexerSummary {
  if (historyFailed || chains.some(({ status }) => status.kind === 'offline')) return { kind: 'offline' };
  const lagging = chains.flatMap(({ chainId, status }) => (status.kind === 'lagging' ? [{ chainId, blocks: status.blocks }] : []));
  return lagging.length > 0 ? { kind: 'lagging', chains: lagging } : { kind: 'synced' };
}
