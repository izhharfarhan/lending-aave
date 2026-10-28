# lending-indexer

Ponder indexer untuk riwayat posisi Aave v3.7 (lending-web) di Ethereum, Base, dan Arbitrum: `Supply`, `Withdraw`,
`Borrow`, `Repay`, dan `ReserveUsedAsCollateralEnabled/Disabled` (tiket 19–20). Likuidasi menyusul di tiket 21.

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
lending-web); test integrasi menyalakan Anvil sendiri untuk ketiga chain (:48555/:48556/:48557). `.env.fork` tetap harus ada (salinan
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
`withdraw`, `borrow`, `repay`, `collateral`.

- `owner` = pemilik posisi dari field event (DECISIONS #11), bukan `txFrom`. `caller` = pemanggil Pool.

  | Event | `owner` | `caller` |
  |---|---|---|
  | Supply, Borrow | `onBehalfOf` | `user` (gateway untuk depositETH/borrowETH) |
  | Repay | `user` | `repayer` (gateway untuk repayETH) |
  | Withdraw | `user` | `user` |
  | Withdraw lewat gateway (withdrawETH) | pengirim `Transfer` aWETH → gateway di tx yang sama (V2) | gateway |
  | ReserveUsedAsCollateralEnabled/Disabled | `user` | `user` |

- `collateralEnabled`: jaminan yang berubah di baris itu, kosong kalau nggak berubah. Event jaminan otomatis (supply
  pertama mengaktifkan; withdraw atau repay pakai aToken yang menghabiskan saldo menonaktifkan) digabung ke baris aksi
  di tx yang sama untuk reserve dan pemilik yang sama ("Supply 1 ETH · jaminan aktif", V3/Q18), apa pun urutan log-nya.
  Baris `collateral` (tanpa `amount`) cuma untuk toggle manual. Aturannya di `src/core/collateralMerge.ts`; tabel
  bantu `tx_slot` dan `gateway_transfer` cuma untuk handler, bukan untuk frontend.
- `amount` bigint mentah; desimal dan format urusan frontend.
- Alamat disimpan huruf kecil, dan filter GraphQL peka huruf besar-kecil: kirim `owner` dalam huruf kecil (alamat
  checksum dari wallet mengembalikan daftar kosong tanpa error).
- Riwayat semua chain diurutkan dengan `timestamp`; `blockNumber` + `logIndex` cuma untuk urutan di dalam satu chain
  (nomor blok antar chain nggak sebanding).
- Status sinkron per chain: `_meta { status }` bawaan Ponder, blok terakhir yang sudah di-index per nama chain
  (`mainnet`, `base`, `arbitrum`) beserta timestamp-nya. "Tertinggal N blok" = blok terbaru chain (dari RPC app)
  dikurangi angka ini.

Contoh query:

```graphql
{
  positionEvents(
    where: { owner: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", chainId_in: [1, 42161], kind_in: [supply, withdraw] }
    orderBy: "timestamp", orderDirection: "desc"
  ) { items { chainId kind reserve amount collateralEnabled txHash timestamp } }
  _meta { status }
}
```
