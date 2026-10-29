# lending-web

Dashboard lending di atas Aave v3.7 (Pool revision 11) untuk Ethereum, Base, dan Arbitrum dalam satu tampilan: posisi
semua chain, health factor, simulasi aksi (supply, withdraw, borrow, repay, jaminan), riwayat, dan pemberitahuan
likuidasi. Proyek belajar; jalan lokal saja.

- Keputusan desain: [`DECISIONS.md`](DECISIONS.md) · istilah UI: [`GLOSSARY.md`](GLOSSARY.md) · ADR: [`docs/adr/`](docs/adr/)
- Spec & tiket: `.scratch/lending-aave/`
- Indexer riwayat: repo [`lending-indexer`](../lending-indexer) (di-clone bersebelahan: `lending-aave/lending-web`,
  `lending-aave/lending-indexer`)

## Prasyarat

Node 22+, pnpm, [Foundry](https://getfoundry.sh) (`anvil`, untuk mode fork dan test fork), Docker (indexer).

## Env

`.env.example` disalin ke `.env.fork` dan `.env.mainnet` (dua-duanya di-ignore git):

| Variabel | Dipakai | Isi |
|---|---|---|
| `NEXT_PUBLIC_APP_MODE` | app | `fork` atau `mainnet` |
| `NEXT_PUBLIC_RPC_URL_<chainId>` | app mode mainnet | RPC per chain (1, 8453, 42161) |
| `ANVIL_FORK_URL_<chainId>` | `anvil:up`, test fork, E2E | RPC **archive** per chain, cuma di `.env.fork` |
| `NEXT_PUBLIC_INDEXER_URL` | app | GraphQL indexer, mis. `http://localhost:42070`; kosong = indexer offline |

- **Ubah `.env.*` → restart dev server.** Next membaca env (dan meng-inline `NEXT_PUBLIC_*`) saat server mulai; server
  yang sudah jalan tetap memakai nilai lama (mis. sidebar terus menulis "Indexer offline" padahal indexer sehat).
- `NEXT_PUBLIC_RPC_URL_*` ikut ke bundle browser. Pakai key yang dibatasi domain/allowlist di dashboard provider, dan
  jangan pernah membagikan atau mencetak URL ber-key.
- **RPC archive**: Anvil di-fork di blok pin lama (`src/config/forkChains.json`), jadi `ANVIL_FORK_URL_*` harus bisa
  memberi state di blok itu. RPC non-archive ditolak `anvil:up` di depan (DECISIONS V7). Alchemy free membatasi
  `eth_getLogs` 10 blok per request (Q31).

## Mode fork (Anvil)

```bash
pnpm install
pnpm anvil:up     # 3 Anvil di blok pin: Ethereum :8555, Base :8556, Arbitrum :8557
pnpm dev:fork     # app di http://localhost:3200, banner FORK MODE + Dev Tools
```

- `anvil:up` menghapus kode delegasi **EIP-7702** dari semua akun tes (`src/config/testAccounts.json`, user + likuidator).
  Private key akun dev Anvil itu publik, jadi di mainnet sudah dipasangi delegasi oleh orang lain; tanpa dibersihkan
  akun tes bukan EOA lagi (V7). Lalu satu blok kosong ditambang supaya indexer bisa mulai di blok pin + 1.
- Connect lewat "Anvil (fork lokal)" (Anvil yang sign, tanpa popup). Pengaman fork mengunci semua transaksi kalau chain
  yang dipilih bukan Anvil di blok pin.
- Dev Tools (kiri bawah; mobile: pil kanan bawah): tolak wallet, latency acak, maju waktu, faucet, E-Mode, harga
  oracle, likuidasi oleh akun likuidator. Aksi Dev Tools berlaku di chain terpilih.
- Riwayat: jalankan indexer (`pnpm db:up && pnpm dev:fork` di lending-indexer). **Tiap Anvil di-restart, jalankan
  `pnpm db:reset:fork` di lending-indexer** (chain-nya baru). Uji yang mengubah Anvil dev sebaiknya dibungkus
  `evm_snapshot`/`evm_revert`, lalu `db:reset:fork` + `dev:fork` ulang supaya indexer nggak menyimpan tx yang sudah
  di-revert.

## Test

```bash
pnpm typecheck
pnpm test                                           # Jest: modul domain (src/core), formatter, config
pnpm test:fork src/aave/supply.fork.spec.ts --verbose  # Jest fork: Anvil sendiri (:18555–18557), per file
pnpm test:e2e                                       # Playwright: build :3300 + Anvil E2E :28555 (Ethereum)
```

- Test fork menyalakan Anvil sendiri per chain yang punya spec di run itu (`*.base.fork.spec.ts`,
  `*.arbitrum.fork.spec.ts`), snapshot/revert per test. Jalankan per file; fork dingin bisa makan beberapa menit.
- E2E memakai Playwright 1.64.1 (`pnpm exec playwright install chromium` kalau browser-nya belum ada). Build-nya
  terpisah (`.next-e2e`) dan nggak menyentuh `anvil:up`, `dev:fork`, atau indexer.

## Mode mainnet

```bash
pnpm check:mainnet   # read-only: POOL_REVISION = 11 di 3 chain + perkiraan biaya smoke test dari gas saat ini
pnpm dev:mainnet     # app di http://localhost:3200 dengan .env.mainnet
```

- Tanpa banner FORK MODE, Dev Tools, connector Anvil, dan pengaman fork; wallet asli yang sign.
- Kalau `POOL_REVISION` bukan 11, aturan E-Mode/event yang diverifikasi (DECISIONS "Versi ter-deploy") harus dicek
  ulang sebelum dipakai.
- Riwayat & banner likuidasi butuh indexer mainnet (`dev:mainnet` di lending-indexer). Indexer mainnet mulai dari
  `START_BLOCK_<chainId>` (blok terbaru saat pertama dijalankan): **transaksi dan likuidasi sebelum itu nggak tampil**.
  Transaksi yang dikirim dari browser ini tetap tampil dari riwayat lokal ("Menunggu indexer").
- Smoke test transaksi nyata: [`docs/smoke-test-mainnet.md`](docs/smoke-test-mainnet.md).

## Font

Unbounded, IBM Plex Sans, dan IBM Plex Mono dimuat lewat `next/font/google` (DECISIONS Q20): diunduh saat build/dev
pertama, jadi butuh internet sekali, lalu di-self-host oleh Next. `public/fonts/local/` di-ignore git, disediakan untuk
font berlisensi personal yang dipasang lokal saja; saat ini belum dipakai (`src/app/layout.tsx` tidak memuatnya). Untuk
memakainya, taruh file font di sana dan ganti font terkait di `layout.tsx` ke `next/font/local`.
