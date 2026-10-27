# 05: Withdraw ERC20 + toggle jaminan

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa menarik supply dan menyalakan/mematikan aset sebagai jaminan, dengan HF sesudah dan kunci yang mencegah posisi melewati batas LTV.

**Blocked by:** 04 (Borrow & repay ERC20 + simulasi risiko + test paritas dasar)

**Status:** resolved

- [x] Simulasi withdraw dan toggle jaminan di modul domain, dengan tier #9
- [x] Withdraw dan mematikan jaminan dikunci di batas LTV, **lebih ketat dari kontrak** (kontrak hanya HF ≥ 1; V8). Ini disengaja dan dicatat di komentar/test
- [x] Toggle jaminan di tabel Supply Anda membuka panel yang menjelaskan akibatnya + HF sebelum → sesudah; dikunci "Jaminan ini masih dibutuhkan" kalau melewati batas
- [x] Pesan aturan ltv0 diterjemahkan (mis. punya jaminan USDC.e ber-LTV 0 → harus ditarik/dimatikan dulu)
- [x] Posisi Dibekukan tetap bisa withdraw/repay; Dijeda semua aksi nonaktif dengan penjelasan
- [x] Test Jest modul domain + `nextStep`, dan withdraw/toggle di fork

## Comments

- 2026-10-27 (implementasi):
  - `simulate()` sekarang mencakup withdraw dan toggle jaminan. Aturan kontrak v3.7 yang dimodelkan: withdraw jaminan dicek (`validateHFAndLtvzero`) hanya kalau user punya utang; mematikan jaminan selalu dicek; saldo yang habis mematikan flag jaminan; menyalakan butuh LTV ≠ 0.
  - **V8, sengaja lebih ketat dari kontrak**: withdraw dan mematikan jaminan dikunci begitu melewati batas LTV, walaupun kontrak masih menerima selama HF ≥ 1. Test Jest (withdraw 4,64 ETH, HF 1,015) dan test fork (withdraw 140 USDC, HF ≈ 1,04: estimasi kontrak lolos, app mengunci; 220 USDC: keduanya menolak `HealthFactorLowerThanLiquidationThreshold`).
  - Withdraw yang tidak mengurangi jaminan (aset bukan jaminan) tidak pernah minta konfirmasi #9.
  - "Withdraw semua" (Q26) dikirim sebagai `type(uint256).max` kalau jumlahnya ±bunga supply 1 hari dari saldo; angka jauh di atas saldo = "Saldo tidak cukup".
  - **Keputusan (disetujui user 2026-10-27)**: "tanpa utang yang bergantung padanya" (spec Q26) dibaca sebagai *aset itu nggak dibutuhkan utang*, bukan *nggak ada utang sama sekali*. Jadi "withdraw semua" boleh walaupun ada utang; simulasi dengan seluruh saldo yang memutuskan: kalau saldo itu masih dibutuhkan, tombol terkunci (V8); kalau jaminan lain cukup, semuanya ditarik tanpa debu.
  - **Keputusan (user 2026-10-27)**: withdraw yang dikunci di batas LTV memakai teks tombol "Jaminan ini masih dibutuhkan" (sama dengan mematikan jaminan), karena user sedang menarik, bukan meminjam. "Melebihi batas pinjam" hanya untuk borrow.
  - Aturan ltv0: pesan menyebut nama jaminan ber-LTV 0 dan, kalau semuanya aset luar, mengarahkan ke app.aave.com. Hanya diuji di Jest (fixture asli dengan LTV tBTC dibuat 0); di blok pin nggak ada aset whitelist ber-LTV 0, dan mengubah LTV reserve di fork butuh impersonate admin.
  - Posisi Dibekukan: withdraw, repay, toggle jaminan tetap bisa. Posisi Dijeda: baris tetap bisa dibuka, panel menjelaskan dan `nextStep` mengembalikan `paused` (semua aksi nonaktif).
  - Switch jaminan di "Supply Anda" membuka panel penjelasan (bukan langsung mengubah). Toggle jaminan ETH langsung ke Pool (reserve WETH), nggak lewat gateway.
  - Riwayat lokal: jenis `withdraw`, `collateralOn`, `collateralOff` (toggle mencatat saldo supply saat itu).
  - Perbaikan bug tiket 04 yang ketemu di run fork: sesudah approve "utang + bantalan 1 hari", baca ulang menghitung bantalan dari utang yang sudah naik beberapa detik, jadi kadang minta approve kedua (1 unit). `RepayPlan.required` = utang + bunga 1 jam: izin minimum untuk lanjut, terpisah dari jumlah yang di-approve.
