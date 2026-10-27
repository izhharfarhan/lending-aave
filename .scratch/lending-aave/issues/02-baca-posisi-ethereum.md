# 02: Baca posisi Ethereum (read-only)

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User yang connect melihat detail chain Ethereum: tabel Supply Anda, Utang Anda, Pasar supply, dan Pasar pinjam, dengan HF, tingkat risiko, dan sisa batas pinjam yang benar. User yang belum connect tetap bisa melihat daftar aset dan APY. Ini juga melahirkan modul domain murni (seam utama Q25) beserta fixture on-chain asli.

**Blocked by:** 01 (Fork Ethereum + wallet + pengaman + kerangka tampilan)

**Status:** resolved

- [x] Data dibaca lewat satu multicall: `UiPoolDataProviderV3` (reserve + posisi user) dan `Pool.getUserAccountData`
- [x] Whitelist berbasis **alamat** per chain (Ethereum WETH/ETH, USDC, USDT); parameter (LTV, LT, APY, flag) dibaca dari kontrak, tidak di-hardcode
- [x] Modul domain murni menghasilkan tampilan posisi: HF, tingkat risiko (Aman ≥ 2,0 · Waspada 1,5–2,0 · Bahaya < 1,5; Aman netral, Waspada amber, Bahaya merah), total jaminan/utang, sisa batas pinjam, batas pinjam terpakai
- [x] HF, total, dan sisa batas pinjam **saat ini** yang ditampilkan berasal dari `getUserAccountData`; tanpa utang ditulis "Tidak ada utang", bukan "∞"
- [x] Aset luar tampil read-only "aset luar · dikelola di app.aave.com ↗" dan tetap ikut terhitung
- [x] Posisi di reserve frozen/paused tetap tampil dengan label **Dibekukan** / **Dijeda**; reserve frozen/paused/nonaktif tidak muncul di Pasar supply/pinjam (#4)
- [x] Pasar supply menyembunyikan saldo wallet 0, dengan toggle "Tampilkan semua"; Pasar pinjam ikut `borrowingEnabled`
- [x] Tabel datar dengan logo token inisial di lingkaran berwarna (prototype)
- [x] Belum connect: daftar aset + APY read-only dan ajakan connect (Q6)
- [x] Test Jest modul domain (positive/negative/edge) dengan fixture dari data on-chain asli

## Comments

- 2026-10-27: Selesai di branch `feat/02-baca-posisi-ethereum` (ditumpuk di atas `feat/01-fork-wallet`, yang belum di-merge).
  - ABI `UiPoolDataProviderV3` ditulis sendiri dari aave-v3-origin (`src/aave/abis.ts`); ABI di address-book masih bentuk v3.0 (ada stable rate, tanpa `virtualUnderlyingBalance`). `getEModes` belum dipakai: struct-nya nggak bisa di-decode terhadap kontrak yang ter-deploy di blok pin, jadi perlu dicek ulang di tiket 14.
  - Adapter `readChain`: reserve, posisi user, `getUserAccountData`, saldo wallet whitelist, dan timestamp blok (`Multicall3.getCurrentBlockTimestamp`) dalam satu multicall di blok yang sama.
  - Modul domain `src/core/chainPosition.ts` (seam Q25 #1), dengan 24 test Jest.
    - Fixture: 6 akun mainnet nyata di blok pin (`pnpm fixture:position`): Aman, Waspada, Bahaya + aset luar (tBTC/GHO), LINK non-jaminan + utang ETH, tanpa utang, dan kosong.
    - Saldo dihitung persis seperti kontrak v3.7: bunga supply linear, utang majemuk binomial, aToken dibulatkan ke bawah, utang ke atas. Jumlah USD per baris cocok dengan total `getUserAccountData`.
    - Di blok pin nggak ada reserve whitelist yang frozen/paused. Kasus Dibekukan/Dijeda/nonaktif dibuat dari fixture asli dengan mengganti satu flag.
  - Verifikasi browser (Playwright):
    - Belum connect: 3 aset + APY, kolom wallet "—".
    - Akun tes: tanpa utang, Pasar supply cuma ETH.
    - Akun mainnet Bahaya (`testAccounts.json` diarahkan sementara, cuma baca): HF 1,30 merah, label aset luar, toggle "Tampilkan semua".
    - Ketemu dan diperbaiki: `usd()` crash (RangeError) untuk nilai ≥ $100.
  - Review dua sumbu, yang diperbaiki:
    - HF ditampilkan dibulatkan ke bawah, supaya 1,996 nggak tertulis "2,00 Waspada".
    - Teks "> 100%" dipindah ke `copy.ts`.
    - `ReserveStatus` memakai istilah glosarium (`dibekukan`/`dijeda`).
    - Ditambah test LTV 0 + utang.
  - Review, yang sengaja nggak diubah:
    - Nama "Pasar supply/pinjam" tetap, karena itu nama di tiket dan spec.
    - Smell lain (duplikasi baris tabel, `buildChainView` panjang) dibiarkan sampai panel aksi (tiket 03) memperjelas bentuknya.
  - Fork dingin: `getReservesData` pertama bisa makan beberapa menit (storage diambil dari Alchemy), jadi timeout transport fork dinaikkan ke 120 detik.
  - Sengaja belum:
    - Baris yang bisa diklik dan panel aksi (03).
    - Toggle jaminan (05).
    - Kapasitas pool di "Bisa Anda pinjam" (08).
    - E-Mode `borrowableBitmap` dan test paritas (14).
    - Detail parameter (15).
    - Ajakan connect versi hero (11).
