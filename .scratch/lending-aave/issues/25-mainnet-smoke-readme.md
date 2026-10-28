# 25: Mode mainnet + smoke test + README

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** App berjalan di mode mainnet lewat Alchemy, diverifikasi dengan transaksi beneran nominal kecil di tiap chain, dan README menjelaskan cara menjalankan semuanya.

**Blocked by:** Semua tiket 01–24

**Status:** ready-for-agent

- [x] Mode mainnet (Alchemy) tanpa Dev Tools dan tanpa pengaman fork
- [ ] Smoke test: supply → borrow → repay nominal kecil di Ethereum, Base, dan Arbitrum; verifikasi L1 fee Base
- [x] README lending-web + lending-indexer: setup env, `anvil:up`, menjalankan app/indexer/test, catatan RPC archive dan EIP-7702, cara memasang font lokal
- [x] Cek `POOL_REVISION` masih 11 di ketiga chain; kalau berubah, cek ulang aturan E-Mode/event sebelum lanjut

## Comments

- 2026-10-28 (dari tiket 19, DECISIONS Q31; dikerjakan di tiket ini, bukan sebelumnya):
  - Indexer mode mainnet memakai key Alchemy **terpisah** dari app/fork lewat env var sendiri (`PONDER_RPC_URL_<chainId>`), supaya kuota indexer yang habis nggak mematikan app dan fork. User yang membuat key-nya; agent cukup menyiapkan nama variabel di `.env.example` tanpa nilai.
  - Ukur pemakaian kuota Alchemy untuk sync live Arbitrum (±4 blok/detik) selama smoke test, dan catat angkanya.
  - README: riwayat dan banner likuidasi di mainnet mulai dari start block indexer; likuidasi sebelum itu nggak tampil.
- 2026-10-28 (persiapan tanpa dana; smoke test dijalankan & ditandatangani user sendiri, agent nggak mengirim tx mainnet):
  - `pnpm check:mainnet` (read-only): `POOL_REVISION` = 11 di Ethereum (blok 26.291.673), Base (53.203.252), Arbitrum (519.066.147). Script yang sama mencetak perkiraan biaya smoke test dari gas saat ini (`STEP_GAS` × gasPrice + L1 fee Base): Ethereum ±$0,63 (0,23 gwei), Base ±$0,02, Arbitrum ±$0,06. Arbitrum memakai kalibrasi gas Ethereum; gas unit Arbitrum biasanya lebih besar, tapi tetap sen.
  - Mode mainnet dicek di browser (build `.next-mainnet` :3202, tanpa wallet & tanpa tx): tanpa banner FORK MODE, Dev Tools, dan connector Anvil; nol request ke port Anvil/indexer lokal; tabel 3 chain terbaca; footer "Indexer offline" (indexer mainnet belum ada).
  - README lending-web (baru) + lending-indexer (bagian "Mode mainnet", `pnpm start-blocks:mainnet`, 0be0a1a). Catatan: ubah `.env.*` → restart dev server (env dibaca saat server mulai).
  - Checklist smoke test: `docs/smoke-test-mainnet.md` (Base → Arbitrum → Ethereum; 0,005 ETH + 2 USDC; perlu ±0,05 USDC tambahan per chain untuk melunasi bunga).
  - `START_BLOCK_<id>` indexer mainnet tetap (diisi sekali), bukan `startBlock: "latest"`: start block berubah = build Ponder baru = index ulang, riwayat hilang.
- 2026-10-28 (smoke test Base mainnet, dijalankan & ditandatangani user; 4 tx sukses on-chain, indexer mainnet mencatat semuanya dengan benar):
  - supply 0,001 ETH `0x5bd71abf8fd3afae3a214ec5dac438ab7c5e2af7a9838b1170e1e255823f610b`
  - borrow 0,5 USDC `0xa8ac942526a6e80333d75a631ed4860bec5d616a375aee04210231f045cda347`
  - repay MAX `0x706b84088618a04751c3602cd20953d62aa9e639dc25b762aa979d73ec7928cf`
  - withdraw MAX `0x6b2ad0c8da89db53827f123c32ace3c74a4acd32bf4c8e95617317eff89f3cbc`
  - Biaya: semua tx ±$0,01 di popup MetaMask; L1 fee Base hampir nol, sesuai `check:mainnet`.
  - **Bug 1 (serius), sudah diperbaiki (7af1dd6):** borrow, repay, withdraw status 1 on-chain, tapi panel menulis "gagal" + "Transaksi tidak terkirim. Posisi Anda tidak berubah." + "Coba lagi" (bisa kirim dobel); di withdraw muncul saat MetaMask masih "submitted". Label langkah ikut jadi "Approve 0 USDC"/"Repay 0 USDC". Root cause: sesudah hash ada, semua error masuk satu catch → `failed`. viem `waitForTransactionReceipt` cuma sabar terhadap "tx/receipt belum ada"; error RPC lain (429, key sempat throughput limited saat indexer mengejar blok) me-reject sebelum receipt ada. Pembacaan sesudah receipt (blok riwayat, posisi) yang gagal juga jatuh ke catch itu. Di fork nggak ketahuan: Anvil langsung menambang dan nggak pernah 429. Perbaikan: receipt ditunggu ulang lewat error RPC sampai 3 menit; lewat itu status "belum pasti" + "Cek status lagi" (hash yang sama, bukan kirim ulang; tombol utama terkunci); blok/posisi dicoba 3x tanpa membatalkan hasil receipt; judul langkah memakai jumlah saat dikirim. "Tidak terkirim" sekarang cuma untuk kegagalan sebelum tx disiarkan; revert tetap "gagal di jaringan". Regresi: Jest `src/aave/walletSteps.spec.ts` + E2E yang mencegat RPC dan menjawab 429 untuk receipt (merah di kode lama dengan gejala persis, hijau sesudahnya). Belum diverifikasi ulang di mainnet: user mengulang smoke test Base sekali.
  - **Bug 2 (UX), menunggu keputusan:** posisi debu di Aave Ethereum (jaminan $0,00004, utang $0,00001, HF 2,66) → hero "HF terendah 2,66 · Ethereum" dan segmen "$0,00 supply · $0,00 utang".
  - **Kuota (dashboard Alchemy, satu key untuk web + indexer):** sebelum web+indexer mainnet nyala 0,1 CU/s; saat nyala (±25 menit) rata-rata 136,5 CU/s (5 menit), +±9,7K request, throughput limited sempat 6% saat indexer mengejar blok awal. Proyeksi 24/7 ≈ 354 juta CU/bulan vs free tier ±30 juta → habis ±2–3 hari. Keputusan: indexer mainnet hanya dinyalakan saat dibutuhkan (README indexer, 2d38876); jalan 24/7 butuh provider terpisah atau polling Arbitrum diperlambat (keputusan terpisah). Porsi web vs indexer: lihat pengukuran 2026-10-29 (web di tab tersembunyi 0 CU/s).
  - **Key Alchemy sempat tercetak di log sesi lain**; user akan merotasinya setelah smoke test selesai semua. Sumber: Ponder mencetak error RPC (mis. 429) lengkap dengan URL, dan viem cuma membersihkan `user:pass@`, bukan key di path `/v2/<key>`. Banner Anvil 1.8.6 cuma mencetak host. Perbaikan: `with-env.mjs` kedua repo (`dev:*`, `codegen`, `test`, E2E) + `anvil:up` + stderr Anvil test fork menyaring output (nilai env RPC/DB → nama variabel, pola `/v2|v3/<key>` → `<url ber-key>`); web 3cf8401, indexer 2d38876. Script repo (`check:mainnet`, `start-blocks:mainnet`, `anvil:up`) sendiri cuma mencetak nama variabel/nama error.
  - Web dan indexer dijalankan user sendiri; Ethereum & Arbitrum ditunda sampai bug 1 beres dan saldo diisi.
- 2026-10-29 (ulang smoke test Base sesudah fix bug 1, dijalankan & ditandatangani user):
  - supply 0,001 ETH → borrow 0,5 USDC → repay MAX → withdraw MAX: keempatnya "berhasil, posisi sudah diperbarui", judul langkah tetap (nggak jadi 0). Bug 1 terverifikasi beres di mainnet.
  - On-chain posisi Base kembali 0. Biaya 6 tx (termasuk approve) ±0,000014 ETH (±$0,03).
  - **Kuota, pengukuran tambahan:** web mode mainnet dengan tab browser di belakang = 0 CU/s (polling berhenti saat halaman tersembunyi), jadi 136,5 CU/s sebelumnya hampir seluruhnya indexer. Throughput limited 6% muncul lagi tepat saat indexer dinyalakan dan mengejar blok, mendukung dugaan 429 sebagai pemicu bug 1.
  - **Bug 2 (posisi debu), sudah dikerjakan:** `usd()` menulis "< $0,01" untuk nilai yang nggak sampai satu sen (tanda minus di depan "$" untuk net negatif, mis. "−$12,50"). Posisi debu = utang < $0,01 di satu chain (`isDustPosition`, `DUST_DEBT_USD`): nggak ikut HF terendah, skala HF hero, banner Bahaya (termasuk dari data terakhir chain yang gagal dibaca), dan batas pinjam tertinggi; totalnya tetap ikut. Kalau semua utang debu, hero menulis "Tidak ada utang". Kartu chain dan detail chain tetap menampilkan HF asli + catatan "Posisi debu: utang < $0,01, tidak dihitung di HF terendah"; harga likuidasi di kartu chain disembunyikan untuk posisi debu. GLOSSARY: entri "Posisi debu", "HF terendah" dan "Chain berbahaya" diperbarui. Test: `format.spec.ts` (usd) + `summary.spec.ts` (posisi debu), merah sebelum perbaikan. Belum dicek visual di mainnet.
  - Ethereum & Arbitrum masih ditunda sampai saldo user diisi.
