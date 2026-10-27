# 04: Borrow & repay ERC20 + simulasi risiko + test paritas dasar

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa meminjam dan melunasi stablecoin sambil melihat HF dan harga likuidasi sebelum → sesudah, sisa batas pinjam, dan konfirmasi yang makin ketat sesuai risiko. Modul domain dibuktikan sama dengan kontrak lewat test paritas dasar.

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** ready-for-agent

- [ ] Simulasi borrow/repay di modul domain: posisi sesudah, HF sesudah, harga likuidasi sesudah (Q14, semua varian `kind`: price turun/naik, now, none, mixed, noDebt), sisa batas pinjam sesudah
- [ ] Tier #9 untuk borrow: amber (1,5–2,0), wajib centang (1,1–1,5), wajib ketik "confirm" (< 1,1), dikunci "Melebihi batas pinjam" (melewati LTV)
- [ ] Harga likuidasi ditulis "Dilikuidasi kalau ETH turun ke $x (−y%)" / "…naik ke $x (+y%)" dengan label "saat ini"; ditampilkan di kepala detail chain dan di panel (Q15)
- [ ] Panel borrow menampilkan "Jaminan Anda di <chain>: …"; tanpa jaminan → tombol utama "Supply jaminan dulu" membuka tab Supply (Q11)
- [ ] Repay penuh memakai `type(uint256).max` dengan izin berbantalan, tanpa sisa debu bunga (#8)
- [ ] **Test paritas dasar** di fork: untuk posisi jaminan ETH + utang stable, posisi campuran, dan posisi dengan aset luar, HF, total jaminan, total utang, dan sisa batas pinjam modul domain = `getUserAccountData`; toleransi sekecil mungkin dan setiap selisih pembulatan dijelaskan sebabnya
- [ ] Test Jest modul domain untuk simulasi, harga likuidasi, dan tier #9
