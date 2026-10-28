# 24: E2E Playwright

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Alur utama supply → borrow → repay berjalan di browser melawan fork, termasuk skenario reject, sebagai pengaman regresi.

**Blocked by:** 07 (Withdraw ETH + borrow ETH lewat WrappedTokenGateway), 17 (Dev Tools dasar + maju waktu)

**Status:** resolved

- [x] Playwright + connector fork (pola e2e swap-web)
- [x] Alur supply → borrow → repay, plus skenario reject di wallet
- [x] 9 state Q22 tidak diulang di browser (sudah diuji di modul domain dan `nextStep`)

## Comments

- 2026-10-28 (selesai): `pnpm test:e2e` (Playwright 1.64.1, versi sama dengan swap-web supaya browser terpasang dipakai bareng). Pola swap-web: build produksi terpisah `e2e:serve` (`.next-e2e`, :3300, `NEXT_PUBLIC_FORK_PORT_OFFSET=20000`, indexer kosong) yang menembak Anvil E2E sendiri (:28555, dinyalakan `e2e/globalSetup.ts` lewat `startAnvil` test fork), snapshot/revert per test. Anvil dev, `dev:fork` indexer, dan dev server nggak tersentuh.
  - Cuma Ethereum: Base/Arbitrum di halaman E2E tampil "Gagal dimuat" / "RPC gagal" (Anvil-nya memang nggak dinyalakan); alur per chain sudah dicakup test fork per chain.
  - Tiga test (±25 dtk sesudah build): supply 1 ETH → borrow 500 USDC → approve + repay 200 USDC (dicek on-chain: aWETH, saldo USDC, utang ±300); reject aksi Pool (supply) dan reject approve (repay) → pesan tolak, tombol tetap di langkah itu, nonce & allowance nggak berubah, lalu dilanjutkan sampai sukses; reject credit delegation borrow ETH → sama, lalu sukses.
  - Nggak diuji di browser: reject ganti network (butuh Anvil chain kedua; sudah di `nextStep`), 9 state Q22 (modul domain + `nextStep`).
  - Teks tombol/pesan diambil dari `src/copy.ts` (`CTA`, `GRANT`, `TX`, `TX_ERROR`), jadi test ikut kalau copy berubah.
  - `src/config/fork.ts`: port + `NEXT_PUBLIC_FORK_PORT_OFFSET` (0 di luar E2E); `next.config.ts`: `distDir` dari `NEXT_DIST_DIR`. `test:fork` nggak dijalankan ulang (perubahannya cuma export + parameter port ber-default).
