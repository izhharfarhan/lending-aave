# 21: Indexer: likuidasi

**Repo:** lending-indexer

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Likuidasi yang dikirim pihak lain tercatat lengkap: jaminan yang hilang, utang yang dilunasi, penalti, protocol fee, sisa utang yang dihapus, dan HF sebelum likuidasi.

**Blocked by:** 20 (Indexer: semua event, 3 chain)

**Status:** ready-for-agent

- [ ] Event `LiquidationCall` (pemilik = `user`), `DeficitCreated`, dan `Transfer` aToken borrower → treasury di tx yang sama (protocol fee, disimpan apa adanya)
- [ ] Jaminan hilang = `liquidatedCollateralAmount` + protocol fee; bonus = kategori E-Mode kalau user di E-Mode dan aset jaminan di `collateralBitmap`, selain itu bonus reserve; penalti = total − total/bonus (V5)
- [ ] `debtToCover` disimpan sebagai utang yang benar-benar dilunasi
- [ ] HF sebelum likuidasi dari `getUserAccountData` di blok −1; kalau gagal disimpan "tidak tersedia" tanpa menggagalkan baris (Q16)
- [ ] Event jaminan otomatis karena likuidasi digabung ke baris likuidasi
- [ ] Test Vitest dengan fixture likuidasi dari fork (pakai alat likuidasi Dev Tools/skrip yang sama)
