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

## Comments

- 2026-10-28 (dari tiket 18): aturan v3.7 (`LiquidationLogic`, dibuktikan di fork tiket 18): close factor 50% hanya kalau HF ≥ 0,95; di bawahnya 100%. Selain itu, kalau sisa utang **atau** sisa jaminan sesudah likuidasi 50% kurang dari $1.000 (`MIN_LEFTOVER_BASE`), likuidasi boleh penuh. Kalau jaminan habis sementara utang masih tersisa, sisanya dihapus (`DeficitCreated`). Di dev fork, posisi kecil (utang ±$1.400) selalu terlikuidasi habis. Akibatnya untuk indexer: jumlah yang dilunasi dan jaminan yang disita diambil dari event (`debtToCover`, `liquidatedCollateralAmount`, Transfer ke treasury), jangan pernah dihitung atau dibatasi dengan asumsi "maksimal 50%". Satu tx bisa menghabiskan posisi dan sekaligus memuat `DeficitCreated`. Fixture: likuidasi sebagian butuh posisi besar (test tiket 18 memakai 10 ETH / 15.000 USDC di harga ETH $1.800); likuidasi penuh + deficit cukup posisi kecil di harga ETH rendah (mis. $1.100).
