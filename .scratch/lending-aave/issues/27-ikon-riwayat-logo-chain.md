# 27: Ikon token di Riwayat + banner likuidasi, logo chain asli

**Repo:** lending-web

**Spec:** permintaan user 2026-10-29 (usulan sesudah tiket 26) · keputusan di `DECISIONS.md` Q20 (logo chain + ikon token di Riwayat dan banner likuidasi)

**What to build:** `TokenIcon` di Riwayat dan banner likuidasi; logo chain asli menggantikan inisial E/B/A di semua tempat yang menampilkan chain.

**Blocked by:** 26

**Status:** resolved

- [x] Ikon token di Riwayat dan banner likuidasi pakai `TokenIcon` yang sama; Dev Tools dibiarkan
- [x] Riwayat lokal baru menyimpan alamat aset; entri lama yang cuma punya simbol tetap inisial (tanpa migrasi, tanpa menebak dari simbol); baris indexer pakai alamat `reserve`
- [x] Logo chain (Ethereum, Base, Arbitrum) menggantikan E/B/A: segmen chain, kartu/kepala detail chain, hero, Riwayat, banner
- [x] File lokal di `public/chains/` dari brand kit resmi, sumber di `public/chains/README.md`; fallback inisial; alt = nama chain; kelihatan di tema gelap
- [x] Test Jest pemetaan + fallback; cek browser desktop + 390px di dev fork

## Comments

- 2026-10-29 (selesai):
  - `src/config/chainLogos.ts` (chainId → file) + `ChainIcon`. `TokenIcon` dan `ChainIcon` sama-sama memakai `LogoMark`: logo nggak ada / file gagal → inisial. File yang sudah gagal sebelum hydration (onError nggak terpanggil) dicek ulang lewat `img.decode()` sesudah mount; ketemu waktu cek browser dengan memblokir `/chains/base.svg`.
  - Logo: Ethereum = berlian ethereum.org (salinan `tokens/eth.svg`, dengan alas terang), Base = "The Square" biru dari github.com/base/brand-kit @eba9e730be34, Arbitrum = logomark Brand Kit Arbitrum Foundation (salinan `tokens/arb.svg`).
  - Tempat logo chain: segmen chain, kepala detail chain, hero (HF terendah + batas pinjam tertinggi), banner Bahaya, banner likuidasi (logo chain yang kena; satu likuidasi juga jaminan yang dijual + utang yang dilunasi), kolom chain Riwayat. Chip filter chain di Riwayat dan footer status jaringan di sidebar tetap teks.
  - `LocalTxEntry.asset.address` opsional; `parseHistory` menerima entri lama tanpa alamat, membuang entri dengan alamat yang bukan alamat. `historyAsset()` di `core/history.ts`: indexer → `reserve`, lokal → alamat tersimpan atau `null`.
  - Test: `chainLogos.spec.ts` (tiap chain punya file yang ada, Ethereum pakai alas, chain asing → `null`), `localHistory.spec.ts` (alamat tersimpan, entri lama tetap, alamat rusak dibuang), `history.spec.ts` (`historyAsset`, entri lama → `null` walau simbolnya punya logo).
  - Browser (Playwright, desktop 1440 + 390px, tema gelap, dev server sementara :3201): indexer user offline, jadi baris indexer + likuidasi disuntik lewat intercept GraphQL dan riwayat lokal lama/baru lewat localStorage. Semua logo termuat, nol request ke luar localhost; DAI (tanpa logo) dan entri lokal lama tampil inisial. Banner Bahaya nggak tampil di fork (HF terendah 1,91), jadi ikonnya belum dilihat di browser.
