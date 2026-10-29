# 26: Logo token asli

**Repo:** lending-web

**Spec:** permintaan user 2026-10-29 (di luar tiket 01–25) · keputusan di `DECISIONS.md` Q20 (logo token asli)

**What to build:** Ganti ikon token inisial di lingkaran berwarna dengan logo asli token, dari file lokal bersumber resmi, dipetakan per alamat + chain, dengan fallback inisial.

**Blocked by:** —

**Status:** resolved

- [x] Aset whitelist (ETH/WETH, USDC, USDT) wajib logo asli; aset luar pakai logo asli kalau ada, kalau nggak ada inisial (nggak pernah gambar rusak)
- [x] File lokal di repo (`public/tokens/`), bukan CDN/URL luar saat runtime; sumber + lisensi tiap file di `public/tokens/README.md`
- [x] Pemetaan per alamat token per chain (USDC native vs USDbC/USDC.e nggak tertukar); ETH dan WETH logo ETH
- [x] Satu komponen `TokenIcon` di semua tempat yang menampilkan ikon token; ukuran tetap; terlihat di tema gelap; alt = simbol
- [x] Test Jest pemetaan alamat → logo + fallback; cek browser desktop + 390px di dev fork

## Comments

- 2026-10-29 (selesai):
  - `src/config/tokenLogos.ts`: alamat dari address-book per chain (kunci "USDCn" = USDC native Arbitrum; "USDC" Arbitrum = USDC.e dan USDbC Base sengaja nggak dipetakan). USDT Arbitrum = USD₮0, pakai logo USD₮0 sendiri. `TokenIcon` menerima `chainId` + `asset`; logo nggak ada atau file gagal dimuat (`onError`) → inisial lama. Berlian ETH (bukan lingkaran) diberi alas terang `--tok-plate`.
  - 25 file: ETH (ethereum.org), USDC (PNG dari repo resmi Circle; circle.com nggak terjangkau dari jaringan agent, SVG brand kit bisa menggantikannya), USDT (tether.to/media), USD₮0 (media kit USDT0), plus 18 aset luar. ENS (wajib lisensi merek), RPL (logo organisasi), CRV/crvUSD (300–430 KB) sengaja inisial. Nggak ada file berlisensi terbuka: pemakaian merek dagang, lihat README.
  - Test: `src/config/tokenLogos.spec.ts` (whitelist semua chain punya logo, alamat per chain, bridged USDC nggak dapat logo USDC, alamat/chain asing → `null`, setiap file yang dipetakan ada).
  - Browser (Playwright, desktop 1440 + 390px, tema gelap): ETH/USDC/USDT di Ethereum, ETH/USDC/USD₮0 di Arbitrum, tabel + pemilih aset panel, semua termuat (nggak ada yang rusak), nol request ke luar localhost. Dicek di dev server sementara :3201 (`.next-check`, sudah dihapus) karena dev server user nggak memuat ulang `globals.css` sampai di-restart.
  - Tempat yang disebut di permintaan tapi belum punya ikon token sama sekali (bukan diganti): Riwayat, banner likuidasi, Dev Tools (`<select>` bawaan, `<option>` nggak bisa memuat gambar). Bottom sheet mobile memuat panel aksi yang sama, jadi sudah ikut. Riwayat lokal cuma menyimpan simbol, bukan alamat. Usulan menyusul, belum dikerjakan.
  - Logo chain (E/B/A) belum diubah; usulan menyusul.
