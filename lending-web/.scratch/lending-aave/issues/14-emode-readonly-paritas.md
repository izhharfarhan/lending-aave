# 14: E-Mode read-only + test paritas E-Mode

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User pro yang mengaktifkan E-Mode lewat app.aave.com melihat keterangan E-Mode dari isi kategorinya, dan semua simulasi memakai LT/LTV E-Mode per aset persis seperti kontrak v3.7.

**Blocked by:** 10 (Base + Arbitrum + pilih chain), 05 (Withdraw ERC20 + toggle jaminan)

**Status:** resolved

- [x] **Sebelum mulai**: cek versi UiPoolDataProvider yang ter-deploy di Ethereum, Base, dan Arbitrum (lihat Comments 2026-10-27). Kalau struct `getEModes` beda dengan v3.7, baca data E-Mode langsung dari getter E-Mode di Pool v3.7 dan catat sebagai keputusan di DECISIONS.md
- [x] Baca `userEmodeCategoryId` dan data kategori E-Mode (`getEModes()` atau getter Pool, sesuai hasil cek di atas)
- [x] Aturan per aset (V4): LT kategori untuk aset di `collateralBitmap`, selain itu LT reserve; LTV kategori untuk aset di `collateralBitmap` atau 0 kalau di `ltvzeroBitmap`; aset di luar bitmap LTV 0 kalau kategori `isolated`, selain itu LTV reserve
- [x] Pasar pinjam di E-Mode = `borrowableBitmap` (flag `borrowingEnabled` diabaikan), tanpa reserve frozen/paused
- [x] Keterangan read-only dari isi kategori: "E-Mode aktif · jaminan: … · pinjaman: … · diatur di app.aave.com ↗"; label on-chain hanya di Detail
- [x] Test wajib Q13 (Jest): simulasi HF, sisa batas pinjam, harga likuidasi, dan filter daftar pinjam dengan E-Mode aktif/nonaktif, termasuk aset di luar `collateralBitmap`, aset di `ltvzeroBitmap`, dan kategori `isolated`
- [x] **Test paritas E-Mode** di fork: posisi dengan E-Mode aktif (diaktifkan langsung lewat Pool di fork), hasil modul domain = `getUserAccountData`

## Comments

- 2026-10-27 (dari tiket 02): `getEModes` di UiPoolDataProvider Ethereum (`0x56b7A1012765C285afAC8b8F25C69Bf10ccfE978`, blok pin 26.282.000) **gagal di-decode** dengan struct `EModeCategory` v3.7 dari aave-v3-origin `main` (`ltv, liquidationThreshold, liquidationBonus, collateralBitmap, isolated, label, borrowableBitmap, ltvzeroBitmap`). Error viem: `Bytes value "224" is not a valid boolean`, jadi urutan atau isi field di kontrak yang ter-deploy berbeda.
  - Dugaan: periphery (UiPoolDataProviderV3) belum di-upgrade ke bentuk v3.7 walaupun Pool sudah `POOL_REVISION` 11. `getReservesData`/`getUserReservesData` versi v3.7 tetap ter-decode dengan benar.
  - Langkah:
    1. Cek versi/bytecode UiPoolDataProvider yang ter-deploy di 3 chain (alamat di DECISIONS.md V6), mis. lewat source terverifikasi di explorer atau decode manual return data `getEModes`.
    2. Kalau memang beda dari v3.7: baca data E-Mode langsung dari getter E-Mode di Pool v3.7, dan catat sebagai keputusan di DECISIONS.md.
  - ABI yang dipakai sekarang ada di `src/aave/abis.ts` (`getEModes` sengaja belum dimasukkan).

- 2026-10-27 (dari tiket 04): `src/core/simulate.ts` (`accountOf`, `liquidationOf`, `exceedsLtv`) masih memakai LT/LTV reserve (`reserveLiquidationThreshold`, `baseLTVasCollateral`). Untuk user dengan `eModeCategoryId ≠ 0`, HF/sisa batas pinjam/harga likuidasi "sesudah" dan tier #9 bisa beda dari kontrak sampai aturan V4 dimasukkan di sini. Angka "saat ini" aman karena dari `getUserAccountData`. Test paritas fork (`borrowRepay.fork.spec.ts`) tinggal ditambah posisi E-Mode.
- 2026-10-27 (dari tiket 05): dua tempat lagi yang masih memakai `baseLTVasCollateral` reserve dan harus ikut aturan V4: `SupplyRow.canBeCollateral` (`buildChainView`) dan `breaksLtvZeroRule` (`simulate.ts`, aturan ltv0 harus memakai `ltvzeroBitmap` kategori untuk user di E-Mode).
- 2026-10-28 (dari tiket 13): aksi `supply` di `simulate.ts` (`applyChange`) menentukan jaminan otomatis supply pertama dari `baseLTVasCollateral` reserve; untuk user di E-Mode harus ikut LTV efektif V4 (`ltvzeroBitmap` / di luar `collateralBitmap` kategori `isolated`). Dipakai HF sesudah "Supply jaminan" di panel penyelamatan (`core/rescue.ts`).
- 2026-10-28 (selesai): kolom "bisa jadi jaminan" dan switch jaminan kini ikut LTV efektif ≠ 0 (`collateralParams`, `validateUseAsCollateral` v3.7), bukan `usageAsCollateralEnabled` reserve: flag itu buta E-Mode, dan kontrak nggak memakainya. Alasan lengkap di DECISIONS.md V4 ("Keputusan tiket 14").
