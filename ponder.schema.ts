import { index, onchainEnum, onchainTable, primaryKey } from 'ponder';

import { POSITION_EVENT_KINDS } from './src/core/positionEvent';

export const positionEventKind = onchainEnum('position_event_kind', POSITION_EVENT_KINDS);

// Satu baris per baris riwayat, semua chain dalam satu tabel (riwayat = satu daftar, Q18). Jumlah bigint mentah;
// desimal & format urusan frontend.
export const positionEvent = onchainTable(
  'position_event',
  (t) => ({
    chainId: t.integer().notNull(),
    txHash: t.hex().notNull(),
    // Log event aksinya (atau event jaminan untuk baris collateral).
    logIndex: t.integer().notNull(),
    kind: positionEventKind().notNull(),
    // Pemilik posisi dari field event (#11), bukan `txFrom`.
    owner: t.hex().notNull(),
    // Pemanggil Pool, mis. WrappedTokenGateway untuk ETH.
    caller: t.hex().notNull(),
    txFrom: t.hex().notNull(),
    reserve: t.hex().notNull(),
    // Kosong cuma di baris collateral.
    amount: t.bigint(),
    // Jaminan yang berubah di baris ini: di baris aksi = event jaminan otomatis yang digabung ("Supply 1 ETH · jaminan
    // aktif", V3), di baris collateral = arah toggle manual. Kosong = jaminan nggak berubah.
    collateralEnabled: t.boolean(),
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

// Bantu penggabungan event jaminan (`src/core/collateralMerge.ts`): baris terakhir di satu tx untuk (reserve, pemilik).
// Ponder cuma bisa `find` lewat primary key, jadi event jaminan dan aksinya saling menemukan lewat tabel ini.
export const txSlot = onchainTable(
  'tx_slot',
  (t) => ({
    chainId: t.integer().notNull(),
    txHash: t.hex().notNull(),
    reserve: t.hex().notNull(),
    owner: t.hex().notNull(),
    logIndex: t.integer().notNull(),
  }),
  (table) => ({ pk: primaryKey({ columns: [table.chainId, table.txHash, table.reserve, table.owner] }) }),
);

// `Transfer` aWETH ke WrappedTokenGateway: pemilik withdraw ETH, dipasangkan dengan `Withdraw(user = gateway)` di tx
// yang sama (V2).
export const gatewayTransfer = onchainTable(
  'gateway_transfer',
  (t) => ({
    chainId: t.integer().notNull(),
    txHash: t.hex().notNull(),
    from: t.hex().notNull(),
  }),
  (table) => ({ pk: primaryKey({ columns: [table.chainId, table.txHash] }) }),
);
