import type { Address } from 'viem';

import { toIndexedEntry, type IndexedHistoryEntry, type RawPositionEvent } from '@/core/history';

// Batas Ponder per halaman. Riwayat lebih dari 1000 baris per alamat belum dipaginasi (proyek belajar, pola swap-web).
const LIMIT = 1000;

// Semua chain sekaligus (Q18). Alamat di indexer selalu huruf kecil, dan filter GraphQL peka huruf besar-kecil (README
// lending-indexer), jadi pemilik dikecilkan. Urutan akhir diurus `mergeHistory`.
const HISTORY_QUERY = `query History($owner: String!) {
  positionEvents(where: { owner: $owner }, orderBy: "timestamp", orderDirection: "desc", limit: ${LIMIT}) {
    items {
      chainId txHash logIndex kind reserve amount collateralEnabled timestamp blockNumber
      liquidation {
        debtAsset debtToCover liquidatedCollateralAmount protocolFee liquidationBonus bonusFromEMode eModeCategory penalty
        collateralPrice healthFactorBefore deficitAssets deficitAmounts
      }
    }
  }
}`;

// `_meta.status` = { [nama chain Ponder]: { id, block: { number, timestamp } } }.
const META_QUERY = '{ _meta { status } }';
type MetaStatus = Record<string, { id: number; block: { number: number } }>;

async function graphql<T>(baseUrl: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Indexer membalas HTTP ${response.status}`);
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data) throw new Error(`GraphQL indexer error: ${body.errors?.map((e) => e.message).join('; ')}`);
  return body.data;
}

// Throw = indexer dianggap offline; riwayat lokal tetap tampil.
export async function fetchIndexerHistory(baseUrl: string, owner: Address): Promise<IndexedHistoryEntry[]> {
  const data = await graphql<{ positionEvents: { items: RawPositionEvent[] } }>(baseUrl, HISTORY_QUERY, { owner: owner.toLowerCase() });
  return data.positionEvents.items.map(toIndexedEntry);
}

/** Blok terakhir yang sudah di-index per chainId. Chain yang belum ada di `_meta` nggak muncul. */
export async function fetchIndexedBlocks(baseUrl: string): Promise<Map<number, bigint>> {
  const data = await graphql<{ _meta: { status: MetaStatus | null } }>(baseUrl, META_QUERY);
  return new Map(Object.values(data._meta.status ?? {}).map((status) => [status.id, BigInt(status.block.number)]));
}
