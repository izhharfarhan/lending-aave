import { index, onchainEnum, onchainTable, primaryKey } from 'ponder';

import { POSITION_EVENT_KINDS } from './src/core/positionEvent';

export const positionEventKind = onchainEnum('position_event_kind', POSITION_EVENT_KINDS);

// Satu baris per event posisi, semua chain dalam satu tabel (riwayat = satu daftar, Q18). Jumlah bigint mentah;
// desimal & format urusan frontend.
export const positionEvent = onchainTable(
  'position_event',
  (t) => ({
    chainId: t.integer().notNull(),
    txHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
    kind: positionEventKind().notNull(),
    // Pemilik posisi dari field event (#11), bukan `txFrom`.
    owner: t.hex().notNull(),
    // Pemanggil Pool (`Supply.user`), mis. WrappedTokenGateway untuk ETH.
    caller: t.hex().notNull(),
    txFrom: t.hex().notNull(),
    reserve: t.hex().notNull(),
    amount: t.bigint().notNull(),
    // Detik (timestamp blok); waktu relatif dihitung dari blok terbaru chain itu (Q30).
    timestamp: t.bigint().notNull(),
    // Urutan total bareng `logIndex`: `timestamp` bisa sama untuk dua blok (L2, Anvil automine).
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
    // Riwayat = semua chain milik satu alamat, terbaru dulu (Q18).
    ownerTimeIdx: index().on(table.owner, table.timestamp),
  }),
);
