# 01: Fork Ethereum + wallet + pengaman + kerangka tampilan

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Developer bisa menyalakan Anvil fork Ethereum yang di-pin dengan satu perintah, membuka app di FORK MODE, connect pakai connector fork lokal, dan melihat saldo ETH akun tes di dalam kerangka tampilan final (sidebar, token warna, font). Sejak hari pertama app nggak mungkin mengirim tx ke mainnet waktu mengira sedang di fork, dan akun tes bebas dari delegasi EIP-7702.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Perintah `anvil:up` menyalakan fork Ethereum di blok yang di-pin dan **menolak RPC non-archive** (pelajaran tiket 01 swap-web dan V7)
- [x] Saat fork dinyalakan, `anvil_setCode(akun, 0x)` dijalankan untuk **semua** akun tes yang dipakai, termasuk akun likuidator Dev Tools (bukan cuma akun #0 seperti swap-web)
- [x] Mode fork/mainnet dipilih lewat file env per mode; `.env.example` berisi nama variabel tanpa nilai
- [x] Alamat kontrak Aave Ethereum (Pool, WrappedTokenGateway, UiPoolDataProvider, AaveOracle, ACL_ADMIN) diambil dari `@bgd-labs/aave-address-book`
- [x] wagmi + RainbowKit terpasang, EOA-only; connector fork lokal (akun Anvil unlocked)
- [x] Banner FORK MODE + pengaman fork (connector bukan lokal atau blok tidak cocok → aksi dikunci), mengikuti pola `forkGuard` swap-web
- [x] Kerangka tampilan sesuai Q20 dan prototype `prototype/dashboard`: sidebar (wordmark, Dashboard, Riwayat, E-Mode redup + SEGERA), token warna di CSS variable dengan aksen violet, font Unbounded/IBM Plex Sans/IBM Plex Mono
- [x] Saldo ETH akun tes tampil setelah connect

## Comments

- 2026-10-27: Selesai di branch `feat/01-fork-wallet`.
  - Blok pin Ethereum 26.282.000 (`POOL_REVISION` = 11 di blok itu); port Anvil 8555 supaya nggak bentrok dengan swap-web.
  - Akun tes ada di `src/config/testAccounts.json` (user #0, likuidator #1), dibaca bareng oleh app dan `anvil:up`.
  - Seam test yang disepakati: `checkForkGuard` saja (Jest, 7 test, termasuk gagal tertutup saat `checking`).
  - Verifikasi manual `anvil:up`:
    - Jalur tolak: RPC publicnode → satu baris "ANVIL_FORK_URL_1 nggak bisa ngasih state di blok 26282000 (HTTP 403 Forbidden). Pakai RPC archive." + exit 1, port 8555 tetap kosong.
    - Jalur bagus: RPC archive → `cast code` user = `0x` dan likuidator = `0x`, lalu baris "siap". Kalau pembersihan 7702 gagal dalam 30 detik, semua Anvil dimatikan + exit 1 (jalur gagal ini belum dipicu secara nyata).
  - Verifikasi browser (Playwright): connect lewat "Anvil (fork lokal)" → saldo 10.000 ETH; Anvil dimatikan → peringatan "RPC lokal bukan Anvil fork…".
  - Review dua sumbu: perbaikan Q8 (teks wallet ke modul copy), Q20 (token hazard, aksen dari `--accent`, badge SEGERA netral, CSS portal ditunda ke tiket 11), dan `anvil:up` gagal-keras.
  - Sengaja belum: footer status jaringan di sidebar (tiket 22), pembungkus reject Dev Tools di connector (tiket 17), Base/Arbitrum (tiket 10). Script `build` selalu mode fork karena app cuma jalan lokal.
