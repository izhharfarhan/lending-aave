# 08: MAX per aksi + kapasitas pool

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Tombol MAX selalu mengisi jumlah terbesar yang benar-benar bisa dieksekusi, dan aksi yang pasti ditolak kontrak karena kapasitas pool dikunci dengan pesan jelas sebelum user membayar gas.

**Blocked by:** 07 (Withdraw ETH + borrow ETH lewat WrappedTokenGateway), 09 (Biaya jaringan + ETH kurang untuk gas)

**Status:** resolved

- [x] MAX sesuai Q26: supply ETH = saldo − cadangan gas (pola `maxSpendable` swap-web); supply ERC20 = saldo wallet; withdraw = min(saldo supply, batas LTV, likuiditas) dan "withdraw semua" → `type(uint256).max`; borrow = sampai batas LTV dibatasi borrow cap dan likuiditas; repay = min(utang, saldo wallet), ETH sisakan gas, `type(uint256).max` hanya kalau saldo ≥ utang + bantalan
- [x] **Cadangan gas untuk MAX ETH** (supply ETH dan repay ETH), pola `maxSpendable` swap-web tiket 14: `cadangan = max(minimum per chain, fee × 2)`, dengan minimum Ethereum 0,0005 ETH dan Base/Arbitrum 0,00005 ETH. `fee` = biaya jaringan tx yang tersisa dari tiket 09 (termasuk approve/izin yang belum ada); kalau fee belum diketahui, pakai minimum chain. Hasil MAX = saldo ETH − cadangan, dibulatkan ke bawah ke 6 desimal; saldo ≤ cadangan → MAX 0. ERC20 tanpa cadangan (gas dibayar dari saldo ETH terpisah)
- [x] MAX borrow tetap memicu tier #9 (centang / ketik confirm) untuk jumlah hasilnya
- [x] Kapasitas pool sesuai V8: supply cap, borrow cap (0 = tanpa batas), likuiditas = `virtualUnderlyingBalance`
- [x] Tombol dikunci dengan pesan "Kuota supply aset ini penuh" / "Kuota pinjaman aset ini penuh" / "Likuiditas pool tidak cukup, tersedia X" (urutan `nextStep` langkah kapasitas)
- [x] Field isolation mode lama (debtCeiling, borrowableInIsolation, isolationModeTotalDebt, isSiloedBorrowing) diabaikan; fixture dengan nilai bukan nol tidak mengubah hasil (Q28)
- [x] Test Jest modul domain + `nextStep` untuk semua kasus MAX dan kapasitas

## Comments

- Implementasi:
  - `core/capacity.ts` `poolCapacity`: sisa supply cap, borrow cap, dan likuiditas (`virtualUnderlyingBalance`) dengan aturan v3.7 (`scaledTotalSupply` aToken dibaca lewat multicall kedua di blok yang sama; `accruedToTreasury` + bagian reserveFactor dari bunga pinjaman ikut supply cap; borrow cap dikurangi 2 unit pembulatan ke atas).
  - `nextStep` langkah `overCapacity { limit, available }` di prioritas 9: supply → supply cap; borrow → borrow cap lalu likuiditas; withdraw (termasuk withdraw semua = seluruh saldo) → likuiditas. Repay dan toggle jaminan nggak dibatasi.
  - MAX per tab di `PANEL_TABS.max` (`panelMax`), helper di `core/maxAmount.ts`; batas LTV dicari lewat `simulate` yang sama dengan tombol (binary search), jadi MAX nggak pernah dikunci #9. Cadangan gas ETH pakai `SupportedChain.minGasReserve` (Ethereum 0,0005 ETH) atau 2 × biaya jaringan terakhir yang diketahui.
  - Field isolation mode lama diabaikan (test: nilai bukan nol nggak mengubah hasil panel).
  - Test fork `maxCapacity.fork.spec.ts`: MAX borrow/withdraw/supply ETH/repay penuh berjalan; supply cap & borrow cap diturunkan lewat PoolConfigurator (impersonate executor governance) → MAX mengisi kuota dan lolos, jumlah di atas sisa kuota dikunci tombol **dan** ditolak Pool (`SupplyCapExceeded` / `BorrowCapExceeded`).
- Keputusan implementasi (perlu dikonfirmasi user):
  - **Dua horizon kuota.** Tombol mengunci jumlah yang ditolak kontrak saat ini (Q27 "pasti ditolak"); MAX memakai kuota 10 menit ke depan supaya masih lolos sesudah approve. 1 jam terlalu konservatif: pool USDC Ethereum bertambah ±2,5 USDC/detik oleh bunga, jadi 1 jam menyembunyikan ±9.000 USDC sisa kuota.
  - **MAX di batas LTV disisakan 0,1%** (borrow dan withdraw). Tanpa itu MAX withdraw dikunci "Jaminan ini masih dibutuhkan" begitu posisi dibaca ulang (terbukti di fork), dan MAX borrow bisa ditolak kontrak (`CollateralCannotCoverNewBorrow`).
  - **Teks kuota sebagian.** "Kuota supply/pinjaman aset ini penuh" hanya kalau sisanya 0; kalau masih ada sisa: "Melebihi sisa kuota supply/pinjaman, tersisa X". Beda dari teks spec, karena "penuh" menyesatkan saat masih ada sisa.
  - **MAX repay ETH** berhenti tepat di bawah rentang "lunas penuh" kalau bantalan bunganya akan memakan cadangan gas.
  - **MAX withdraw** di bawah seluruh saldo (likuiditas kurang) dijaga di luar rentang "withdraw semua", yang menarik seluruh saldo dan pasti ditolak likuiditas.
- Catatan: istilah "kapasitas pool", "kuota supply/pinjaman", dan "MAX" belum ada di GLOSSARY.md (untuk `/domain-modeling`).
