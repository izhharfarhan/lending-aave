# 14: E-Mode read-only + test paritas E-Mode

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User pro yang mengaktifkan E-Mode lewat app.aave.com melihat keterangan E-Mode dari isi kategorinya, dan semua simulasi memakai LT/LTV E-Mode per aset persis seperti kontrak v3.7.

**Blocked by:** 10 (Base + Arbitrum + pilih chain), 05 (Withdraw ERC20 + toggle jaminan)

**Status:** ready-for-agent

- [ ] Baca `userEmodeCategoryId` dan `getEModes()`
- [ ] Aturan per aset (V4): LT kategori untuk aset di `collateralBitmap`, selain itu LT reserve; LTV kategori untuk aset di `collateralBitmap` atau 0 kalau di `ltvzeroBitmap`; aset di luar bitmap LTV 0 kalau kategori `isolated`, selain itu LTV reserve
- [ ] Pasar pinjam di E-Mode = `borrowableBitmap` (flag `borrowingEnabled` diabaikan), tanpa reserve frozen/paused
- [ ] Keterangan read-only dari isi kategori: "E-Mode aktif · jaminan: … · pinjaman: … · diatur di app.aave.com ↗"; label on-chain hanya di Detail
- [ ] Test wajib Q13 (Jest): simulasi HF, sisa batas pinjam, harga likuidasi, dan filter daftar pinjam dengan E-Mode aktif/nonaktif, termasuk aset di luar `collateralBitmap`, aset di `ltvzeroBitmap`, dan kategori `isolated`
- [ ] **Test paritas E-Mode** di fork: posisi dengan E-Mode aktif (diaktifkan langsung lewat Pool di fork), hasil modul domain = `getUserAccountData`
