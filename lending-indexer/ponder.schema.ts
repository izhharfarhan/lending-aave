import { index, onchainEnum, onchainTable, primaryKey, relations } from 'ponder';

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

// Rincian baris riwayat `liquidation` (V5, Q16), kunci sama dengan baris `position_event`-nya. Jaminan yang hilang =
// `amount` baris itu (bagian likuidator + protocol fee). Semua jumlah bigint mentah dalam token-nya.
export const liquidation = onchainTable(
  'liquidation',
  (t) => ({
    chainId: t.integer().notNull(),
    txHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
    owner: t.hex().notNull(),
    liquidator: t.hex().notNull(),
    collateralAsset: t.hex().notNull(),
    debtAsset: t.hex().notNull(),
    // Utang yang benar-benar dilunasi (`actualDebtToLiquidate`), bukan yang diminta likuidator.
    debtToCover: t.bigint().notNull(),
    // Jaminan yang diterima likuidator saja.
    liquidatedCollateralAmount: t.bigint().notNull(),
    // `Transfer` aToken jaminan user → treasury di tx yang sama, apa adanya (0 kalau nggak ada).
    protocolFee: t.bigint().notNull(),
    receiveAToken: t.boolean().notNull(),
    // Bonus yang berlaku, basis poin (10.500 = 105%): kategori E-Mode atau reserve (V5).
    liquidationBonus: t.integer().notNull(),
    bonusFromEMode: t.boolean().notNull(),
    // Kategori E-Mode user saat likuidasi (0 = di luar E-Mode).
    eModeCategory: t.integer().notNull(),
    // total − total/bonus, dalam token jaminan.
    penalty: t.bigint().notNull(),
    // Harga jaminan di AaveOracle (mata uang dasar, USD 8 desimal) di blok likuidasi: penalti dalam USD (Q16).
    collateralPrice: t.bigint().notNull(),
    // `getUserAccountData` di blok −1 (1e18 = 1,0). Kosong = tidak tersedia (baca blok lama gagal, Q16).
    healthFactorBefore: t.bigint(),
    // Saldo variable debt token user di reserve utang itu, dibaca di blok likuidasi (seperti bonus/harga): 0 = utang
    // aset itu lunas (kalimat "utang lunas" lending-web).
    debtRemaining: t.bigint().notNull(),
    // Sisa utang yang dihapus (`DeficitCreated`), berpasangan per indeks: aset utang dan jumlahnya.
    deficitAssets: t.hex().array().notNull(),
    deficitAmounts: t.bigint().array().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
    // Banner likuidasi (Q17): likuidasi satu alamat, terbaru dulu.
    ownerTimeIdx: index().on(table.owner, table.timestamp),
  }),
);

// GraphQL: `positionEvents { items { liquidation { … } } }`.
export const positionEventRelations = relations(positionEvent, ({ one }) => ({
  liquidation: one(liquidation, {
    fields: [positionEvent.chainId, positionEvent.txHash, positionEvent.logIndex],
    references: [liquidation.chainId, liquidation.txHash, liquidation.logIndex],
  }),
}));

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
