# 17: Dev Tools dasar + maju waktu

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Di mode fork, developer punya panel Dev Tools seperti swap-web, plus tombol maju waktu supaya bunga dan perubahan HF bisa dilihat tanpa menunggu.

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** resolved

- [x] Fitur Dev Tools swap-web: simulasi reject (tx, signature, switchChain), latency, faucet
- [x] Maju waktu +1 hari / +30 hari / +1 tahun (`evm_increaseTime` + mine), posisi di-refetch setelahnya
- [x] Hanya tampil di mode fork

## Comments

- 2026-10-27 (dari tiket 05): aturan ltv0 (`validateHFAndLtvzero`: selama ada jaminan ber-LTV 0, withdraw/mematikan jaminan lain ditolak `LtvValidationFailed`) baru diuji di Jest dengan fixture yang LTV-nya dimutasi. Begitu impersonate admin Aave tersedia di fork (Dev Tools), tambahkan test fork: set LTV satu reserve jaminan ke 0 lewat PoolConfigurator, lalu buktikan `simulate().ltvZero` / `nextStep` `ltvZero` sama dengan titik kontrak menolak, dan pesan yang menyebut nama asetnya muncul di panel.
- 2026-10-28 (dari tiket 14), dua hal yang menunggu Dev Tools:
  1. Paritas fork E-Mode dengan jaminan ber-LTV 0 begitu ada holder atau faucet ETHx: user di kategori 1 Ethereum ("ETH correlated", ETHx di `ltvzeroBitmap`) dengan jaminan WETH + ETHx, lalu `accountFromReserves` = `getUserAccountData`, `simulate().ltvZero` = titik kontrak menolak withdraw WETH, dan ETHx `canBeCollateral` = false. Test fork E-Mode yang ada: `src/aave/eMode.fork.spec.ts`.
  2. Cek baris "E-Mode aktif · jaminan · pinjaman · diatur di app.aave.com ↗" di browser: Dev Tools perlu cara memasukkan akun tes ke E-Mode (`Pool.setUserEMode`, utang yang ada harus ada di `borrowableBitmap` kategori itu).
- 2026-10-28 (selesai): panel Dev Tools (`app/DevToolsPanel.tsx`, dimuat dinamis kalau `IS_FORK`), kiri bawah di desktop (kanan bawah menutupi tombol utama panel aksi), kanan di atas bar Supply/Borrow di mobile.
  - Reject tx / signature / ganti network lewat pembungkus `request` connector fork (`devtools/withDevToolsRejects.ts`, port swap-web). App ini belum meminta signature; flag-nya ada demi kesamaan dengan swap-web.
  - Latency acak 0–3 detik per bacaan posisi satu chain (`devtools/withRandomLatency.ts`, membungkus queryFn `useChainView`).
  - Maju waktu, faucet, dan E-Mode bekerja di **chain terpilih** saja; sesudahnya semua query dibaca ulang. Faucet pakai `anvil_dealERC20` / `anvil_setBalance` (token apa pun, tanpa holder); jumlahnya mengikuti aturan input panel aksi (`parseAmountInput`).
  - Tambahan dari komentar tiket 14: setelan E-Mode (`setUserEMode`, 0 = keluar) khusus Dev Tools; app untuk user tetap read-only (V4).
  - Komentar tiket 05: test fork ltv0 di `withdrawCollateral.fork.spec.ts` (admin menurunkan LTV USDC ke 0 → withdraw/mematikan ETH ditolak `LtvValidationFailed` persis di titik `ltvZero`; withdraw USDC-nya sendiri tetap boleh). Pesan panel diuji lewat copy + daftar aset yang sama dengan ActionPanel, bukan lewat UI (Q25).
  - Komentar tiket 14 no. 1: paritas fork E-Mode dengan jaminan ETHx ber-LTV 0 di `eMode.fork.spec.ts`. Pool menolak masuk E-Mode selama ada jaminan ber-LTV efektif 0 (`InvalidCollateralInEmode`), jadi posisinya ditiru seperti governance menambahkan ETHx ke `ltvzeroBitmap` sesudah dipakai. Catatan v3.7: LTV yang diatur saat reserve beku cuma jadi `pendingLtv`, dan mencairkan reserve nggak menerapkannya.
  - Komentar tiket 14 no. 2: baris E-Mode dicek di browser (akun tes dimasukkan ke kategori 1 di dalam `evm_snapshot`, lalu di-revert). Ketemu: ETHx (di `ltvzeroBitmap`) ikut tertulis sebagai jaminan. Sekarang `eModeView` membuang aset `ltvzeroBitmap` dari daftar jaminan, sesuai keputusan "bisa jadi jaminan = LTV efektif ≠ 0".
