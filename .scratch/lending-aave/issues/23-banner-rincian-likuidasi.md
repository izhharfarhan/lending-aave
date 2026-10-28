# 23: Banner & rincian likuidasi

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User yang posisinya dilikuidasi melihat banner "Posisi Anda di <chain> dilikuidasi pada <waktu>" di bawah banner Bahaya, dan bisa membuka rincian: apa yang dijual, berapa penaltinya, dan HF waktu itu.

**Blocked by:** 21 (Indexer: likuidasi), 22 (Halaman riwayat + status jaringan), 11 (Dashboard: hero + segmen chain + banner Bahaya)

**Status:** ready-for-agent

- [ ] Banner untuk likuidasi 30 hari terakhir (dihitung dari timestamp blok, Q30) yang belum ditutup; ✕ menyimpan txHash + logIndex di localStorage (Q17)
- [ ] Beberapa likuidasi digabung jadi satu banner + "Lihat riwayat"; posisinya di bawah banner Bahaya
- [ ] Rincian: jaminan dijual (token + USD), utang dilunasi, penalti (token + USD + persen), HF sebelum likuidasi (atau "tidak tersedia"), "sisa utang <x> dihapus" kalau ada `DeficitCreated`, tautan explorer
- [ ] Diverifikasi ujung ke ujung di fork memakai alat likuidasi Dev Tools (tiket 18)

## Comments

- 2026-10-28 (dari tiket 18): aturan v3.7 (`LiquidationLogic`, dibuktikan di fork tiket 18): close factor 50% hanya kalau HF ≥ 0,95; di bawahnya 100%. Selain itu, kalau sisa utang **atau** sisa jaminan sesudah likuidasi 50% kurang dari $1.000 (`MIN_LEFTOVER_BASE`), likuidasi boleh penuh. Kalau jaminan habis sementara utang masih tersisa, sisanya dihapus (`DeficitCreated`). Di dev fork, posisi kecil (utang ±$1.400) selalu terlikuidasi habis. Teks banner dan rincian jangan mengasumsikan "maksimal 50%" atau "separuh posisi": tampilkan jumlah yang benar-benar dilunasi dan disita dari data indexer. Siapkan kalimat untuk posisi yang habis seluruhnya (utang 0 sesudahnya, mungkin plus "sisa utang <x> dihapus"). Verifikasi ujung ke ujung sebaiknya mencoba dua kasus: sebagian (posisi besar) dan habis + deficit (posisi kecil).
