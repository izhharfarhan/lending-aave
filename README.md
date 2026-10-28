# lending-indexer

Ponder indexer untuk riwayat posisi Aave v3.7 (lending-web) di Ethereum, Base, dan Arbitrum: `Supply`, `Withdraw`,
`Borrow`, `Repay`, `ReserveUsedAsCollateralEnabled/Disabled` (tiket 19–20), dan `LiquidationCall` (tiket 21).

Keputusan desain ada di [`lending-web/DECISIONS.md`](../lending-web/DECISIONS.md), spec dan tiket di
`lending-web/.scratch/lending-aave/`. Repo ini dan lending-web di-clone bersebelahan (`lending-aave/lending-web`,
`lending-aave/lending-indexer`).

## Jalankan

Butuh Node ≥ 22.12 (Ponder 0.18), Docker, dan Foundry (`anvil`) untuk test.

Salin `.env.example` ke `.env.fork` (dan `.env.mainnet` untuk mode mainnet), lalu:

```bash
pnpm install
pnpm db:up          # Postgres di 127.0.0.1:5434 (database lending_fork + lending_mainnet)
pnpm dev:fork       # index Anvil lending-web (`pnpm anvil:up` di sana, :8555/:8556/:8557), GraphQL di http://localhost:42070/graphql
pnpm db:reset:fork  # kosongkan database fork; wajib tiap Anvil di-restart (chain-nya baru)
pnpm test           # unit (src/core) + integrasi: Anvil + Ponder + DB sendiri, nggak menyentuh dev:fork
```

`pnpm test` butuh `ANVIL_FORK_URL_1`, `ANVIL_FORK_URL_8453`, dan `ANVIL_FORK_URL_42161` (RPC archive, sama dengan
lending-web); test integrasi menyalakan Anvil sendiri untuk ketiga chain (:48555/:48556/:48557). Anvil test Base
tanpa riwayat state (`--prune-history 0`) untuk menguji HF likuidasi "tidak tersedia". `.env.fork` tetap harus ada (salinan
`.env.example`); nilainya bisa diisi di sana, atau dibiarkan kosong dan diambil dari env lending-web:
`node ../lending-web/scripts/with-env.mjs ../lending-web/.env.fork pnpm test` (nilai yang sudah ada di environment
menang atas isi file).

`dev:fork` mulai di blok pin + 1. Fork yang baru dinyalakan `pnpm anvil:up` (lending-web) sudah menambang satu blok
kosong untuk itu; tanpa blok itu Ponder berhenti dengan `BlockNotFoundError`.

## Blok awal & `eth_getLogs` (DECISIONS Q31)

- **Fork**: index mulai **blok pin + 1** (`src/chains.ts`, sama dengan `lending-web/src/config/forkChains.json`).
  Blok sesudah pin dibuat Anvil sendiri, jadi nggak kena batas 10 blok `eth_getLogs` Alchemy free dan nggak memakai
  kuota. Riwayat sebelum pin memang kosong untuk akun tes.
- `ethGetLogsBlockRange: 10` di config Ponder (batas Alchemy free, terutama untuk mainnet). Efek sampingnya, Ponder
  nggak lagi mengecilkan range otomatis saat `eth_getLogs` ditolak.
- **Mainnet** (tiket 25): `START_BLOCK_<chainId>` = blok terbaru saat indexer mulai; riwayat dan banner likuidasi mulai dari
  situ. `PONDER_RPC_URL_*` memakai key Alchemy terpisah dari app & fork.

## Data

Tabel `position_event`: satu baris per baris riwayat, kunci `(chainId, txHash, logIndex)`. `kind`: `supply`,
`withdraw`, `borrow`, `repay`, `collateral`, `liquidation`.

- `owner` = pemilik posisi dari field event (DECISIONS #11), bukan `txFrom`. `caller` = pemanggil Pool.

  | Event | `owner` | `caller` |
  |---|---|---|
  | Supply, Borrow | `onBehalfOf` | `user` (gateway untuk depositETH/borrowETH) |
  | Repay | `user` | `repayer` (gateway untuk repayETH) |
  | Withdraw | `user` | `user` |
  | Withdraw lewat gateway (withdrawETH) | pengirim `Transfer` aWETH → gateway di tx yang sama (V2) | gateway |
  | ReserveUsedAsCollateralEnabled/Disabled | `user` | `user` |
  | LiquidationCall | `user` (yang dilikuidasi) | likuidator |

- `collateralEnabled`: jaminan yang berubah di baris itu, kosong kalau nggak berubah. Event jaminan otomatis (supply
  pertama mengaktifkan; withdraw, repay pakai aToken, atau likuidasi yang menghabiskan saldo menonaktifkan) digabung ke baris aksi
  di tx yang sama untuk reserve dan pemilik yang sama ("Supply 1 ETH · jaminan aktif", V3/Q18), baik event jaminannya
  terpancar sebelum maupun sesudah event aksinya. Baris `collateral` (tanpa `amount`) untuk event jaminan yang nggak
  punya aksi pasangan. Aturannya di `src/core/collateralMerge.ts`; tabel bantu `tx_slot` dan `gateway_transfer` cuma
  untuk handler, bukan untuk frontend.
- Batasan yang diketahui (penggabungan cuma melihat tx, reserve, pemilik, dan arah; tanpa membaca saldo sebelum tx):
  - Transfer seluruh aToken ke alamat lain (bukan withdraw) memancarkan `ReserveUsedAsCollateralDisabled` otomatis
    tanpa aksi pasangan, jadi tercatat sebagai baris `collateral` seperti toggle manual.
  - Dalam satu tx batch (smart wallet), toggle manual yang searah sebelum supply/withdraw di reserve yang sama ikut
    tergabung ke baris aksi itu.
- `amount` bigint mentah; desimal dan format urusan frontend. Di baris `liquidation` = jaminan yang hilang (bagian
  likuidator + protocol fee, V5).
- Alamat disimpan huruf kecil, dan filter GraphQL peka huruf besar-kecil: kirim `owner` dalam huruf kecil (alamat
  checksum dari wallet mengembalikan daftar kosong tanpa error).
- Riwayat semua chain diurutkan dengan `timestamp`; `blockNumber` + `logIndex` cuma untuk urutan di dalam satu chain
  (nomor blok antar chain nggak sebanding).
- Status sinkron per chain: `_meta { status }` bawaan Ponder, blok terakhir yang sudah di-index per nama chain
  (`mainnet`, `base`, `arbitrum`) beserta timestamp-nya. "Tertinggal N blok" = blok terbaru chain (dari RPC app)
  dikurangi angka ini.

Tabel `liquidation` (V5, Q16): rincian tiap baris `liquidation`, kunci sama dengan baris riwayatnya (relasi GraphQL
`positionEvent.liquidation`). Index `(owner, timestamp)` untuk banner likuidasi (Q17).

- `debtToCover` = utang yang benar-benar dilunasi; `liquidatedCollateralAmount` = bagian likuidator saja.
- `protocolFee` = `Transfer` aToken jaminan user → treasury di tx yang sama, apa adanya. Fee dan `DeficitCreated`
  diambil dari receipt tx likuidasi (satu RPC per likuidasi): address-book nggak memuat semua aToken (Ethereum 63 dari
  67 reserve), jadi mendengarkan `Transfer` per aToken bisa melewatkan fee. Di v3.7 keduanya terpancar sebelum
  `LiquidationCall`; tiap likuidasi cuma memakai log sesudah `LiquidationCall` sebelumnya di tx itu.
- `liquidationBonus` (basis poin) + `bonusFromEMode`: bonus kategori E-Mode kalau user di E-Mode dan aset jaminannya di
  `collateralBitmap`, selain itu bonus reserve. `penalty` = total − total/bonus dalam token jaminan; `collateralPrice` =
  harga AaveOracle jaminan (USD 8 desimal) di blok likuidasi, untuk penalti dalam USD.
- `debtRemaining`: saldo variable debt token user di reserve utang itu (`getReserveVariableDebtToken` + `balanceOf`)
  di blok likuidasi; 0 = utang aset itu lunas (kalimat "utang lunas" lending-web, kasus umum utang < $2.000).
- `deficitAssets` / `deficitAmounts`: sisa utang yang dihapus (`DeficitCreated`), berpasangan per indeks.
- `healthFactorBefore`: `getUserAccountData` di blok −1 (1e18 = 1,0); kosong = tidak tersedia. Kalau RPC nggak punya
  state blok itu, lapisan RPC Ponder me-retry 10× dengan backoff (±1 menit) sebelum handler menyimpan "tidak tersedia",
  dan selama itu indexing chain itu tertahan. Sengaja dibiarkan: tanpa retry, error sementara (mis. rate limit) akan
  tersimpan permanen sebagai "tidak tersedia". RPC indexer memang harus archive (Q16).
- Kompromi yang diketahui:
  - Bonus, kategori E-Mode, harga, dan sisa utang dibaca di **akhir** blok likuidasi. Perubahan di blok yang sama
    sesudah tx likuidasi (`setUserEMode`, konfigurasi, update oracle, borrow/repay user) bisa membuatnya meleset; blok −1 juga salah, karena update
    oracle yang memicu likuidasi sering ada di blok yang sama.
  - Cuma HF yang punya fallback. Bacaan di blok likuidasi diasumsikan selalu ada karena indexer mengikuti ujung chain
    (Q31, tanpa backfill lama); kalau gagal, Ponder me-retry lalu indexing berhenti.
  - Dalam tx batch, `Transfer` aToken jaminan user → treasury yang dikirim manual sebelum likuidasi ikut terhitung
    sebagai fee.
  - Dicek di fork: `receiveAToken = true` nggak memancarkan `ReserveUsedAsCollateralEnabled` untuk likuidator (v3.7),
    jadi nggak ada baris collateral palsu di riwayat likuidator.

Contoh query:

```graphql
{
  positionEvents(
    where: { owner: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", chainId_in: [1, 42161], kind_in: [supply, withdraw, liquidation] }
    orderBy: "timestamp", orderDirection: "desc"
  ) {
    items {
      chainId kind reserve amount collateralEnabled txHash timestamp
      liquidation { debtAsset debtToCover protocolFee liquidationBonus penalty collateralPrice healthFactorBefore debtRemaining deficitAssets deficitAmounts }
    }
  }
  _meta { status }
}
```
