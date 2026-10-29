# 19: Indexer tracer (repo lending-indexer)

**Repo:** lending-indexer

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Supply di fork Ethereum tercatat oleh indexer dan bisa diambil lewat GraphQL dengan pemilik yang benar (dari `onBehalfOf`, bukan `txFrom`).

**Blocked by:** 01 (Fork Ethereum + wallet + pengaman + kerangka tampilan)

**Status:** resolved

- [x] Repo `lending-indexer`: Ponder + Postgres Docker + Hono GraphQL (pola swap-indexer)
- [x] Event `Supply` Pool Ethereum; pemilik = `onBehalfOf`; jumlah disimpan sebagai bigint mentah
- [x] Butuh RPC archive
- [x] **Sebelum implementasi**: putuskan strategi `eth_getLogs` (lihat Comments 2026-10-27) dan **ajukan pilihannya ke user dulu** → Opsi 1 (DECISIONS Q31)
- [x] Test Vitest + fixture Anvil terpisah tanpa revert (pola swap-indexer)

## Comments

- 2026-10-27 (dari tiket 02): RPC fork membatasi `eth_getLogs` **10 blok per request**. Error-nya menyesatkan ("ranges over 10000 blocks are not supported on free plan"), padahal range 3.000 blok pun ditolak. Lewat Anvil fork, log sebelum blok pin diteruskan ke RPC upstream, jadi batas yang sama berlaku.
  - **Koreksi 2026-10-27 (tiket 03)**: RPC-nya **bukan Alchemy**. `.env.fork` (disalin dari swap-web) memakai `ANVIL_FORK_URL_1=https://eth.drpc.org`, jadi batas dan pesan error di atas dari **drpc free plan**. Batas Alchemy sudah dicek ulang, lihat poin berikut.
  - **Dicek ulang 2026-10-27 (sebelum tiket 04)**: `ANVIL_FORK_URL_1` sekarang Alchemy (free tier). `anvil:up` lolos pengecekan archive di blok 26.282.000. Tes `eth_getLogs` langsung ke Alchemy, alamat Pool Ethereum, range berakhir di blok pin:
    - 10 blok: OK (10 log)
    - 11, 500, 2.000 blok: ditolak, `-32600` "Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range … Upgrade to PAYG for expanded block range."
    - Jadi batasnya **sama, 10 blok**, hanya pesan error Alchemy lebih jujur. Ganti ke Alchemy free nggak menghapus kebutuhan memilih strategi di bawah.
  - Pilihan yang perlu diputuskan sebelum implementasi (ajukan ke user, jangan langsung pilih):
    1. `START_BLOCK` dekat blok pin. Backfill pendek, sisanya event dari fork lokal.
    2. RPC lain khusus `getLogs` yang range-nya besar, terpisah dari RPC archive untuk `eth_call` (atau ganti RPC fork ke yang batas `getLogs`-nya lebih longgar).
    3. Batas range di config Ponder (mis. `ethGetLogsBlockRange: 10`). Lambat untuk range panjang.
  - Ini juga menyentuh tiket 20 (3 chain) dan 21 (likuidasi, butuh `getUserAccountData` di blok −1 lewat archive).
- 2026-10-28 (keputusan user, DECISIONS Q31): **Opsi 1**. Index mulai blok pin + 1 di tiap chain, tanpa backfill; batas range `getLogs` 10 blok di config Ponder sebagai pengaman. Mode mainnet: start block = blok terbaru saat indexer mulai (tiket 25).
- 2026-10-28 (selesai): repo `lending-indexer` (Ponder 0.18.2, Postgres docker port 5434, GraphQL `dev:fork` :42070). Tabel `position_event` (semua chain, kolom `kind`/`owner`/`caller`/`txFrom`/`reserve`/`amount`), `owner` = `onBehalfOf`. Test: unit aturan pemilik + blok pin sama dengan lending-web; integrasi (Anvil :48555, Ponder :42170, DB sekali pakai) untuk supply biasa, atas nama akun lain, dan ETH lewat gateway.
  - `anvil:up` lending-web sekarang menambang satu blok kosong sesudah membersihkan akun tes: Ponder berhenti dengan `BlockNotFoundError` (dicek) kalau start block pin + 1 belum ada.
  - Filter GraphQL peka huruf besar-kecil (alamat disimpan huruf kecil); riwayat antar chain diurutkan dengan `timestamp`, bukan `blockNumber`. Relevan untuk tiket 20 & 22.
- 2026-10-28 (verifikasi `anvil:up` + blok kosong di Anvil dev): `anvil:up` dinyalakan ulang dari nol. Ketiga chain berdiri di pin + 1 tanpa tx (Ethereum 26.282.001, Base 52.975.001, Arbitrum 517.470.001). Lalu `db:reset:fork` + `dev:fork`: ketiga chain langsung "live", `_meta.status` = pin + 1 di tiap chain, **nol `BlockNotFoundError`** (dan nol error lain) di log. Supply 1 ETH lewat gateway + borrow 1.000 USDC sesudahnya tercatat dua baris dengan `owner` = akun tes (supply: `caller` = gateway, jaminan aktif).
