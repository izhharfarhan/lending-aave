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
