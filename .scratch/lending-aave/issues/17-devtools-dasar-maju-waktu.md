# 17: Dev Tools dasar + maju waktu

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Di mode fork, developer punya panel Dev Tools seperti swap-web, plus tombol maju waktu supaya bunga dan perubahan HF bisa dilihat tanpa menunggu.

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** ready-for-agent

- [ ] Fitur Dev Tools swap-web: simulasi reject (tx, signature, switchChain), latency, faucet
- [ ] Maju waktu +1 hari / +30 hari / +1 tahun (`evm_increaseTime` + mine), posisi di-refetch setelahnya
- [ ] Hanya tampil di mode fork

## Comments

- 2026-10-27 (dari tiket 05): aturan ltv0 (`validateHFAndLtvzero`: selama ada jaminan ber-LTV 0, withdraw/mematikan jaminan lain ditolak `LtvValidationFailed`) baru diuji di Jest dengan fixture yang LTV-nya dimutasi. Begitu impersonate admin Aave tersedia di fork (Dev Tools), tambahkan test fork: set LTV satu reserve jaminan ke 0 lewat PoolConfigurator, lalu buktikan `simulate().ltvZero` / `nextStep` `ltvZero` sama dengan titik kontrak menolak, dan pesan yang menyebut nama asetnya muncul di panel.
- 2026-10-28 (dari tiket 14), dua hal yang menunggu Dev Tools:
  1. Paritas fork E-Mode dengan jaminan ber-LTV 0 begitu ada holder atau faucet ETHx: user di kategori 1 Ethereum ("ETH correlated", ETHx di `ltvzeroBitmap`) dengan jaminan WETH + ETHx, lalu `accountFromReserves` = `getUserAccountData`, `simulate().ltvZero` = titik kontrak menolak withdraw WETH, dan ETHx `canBeCollateral` = false. Test fork E-Mode yang ada: `src/aave/eMode.fork.spec.ts`.
  2. Cek baris "E-Mode aktif · jaminan · pinjaman · diatur di app.aave.com ↗" di browser: Dev Tools perlu cara memasukkan akun tes ke E-Mode (`Pool.setUserEMode`, utang yang ada harus ada di `borrowableBitmap` kategori itu).
