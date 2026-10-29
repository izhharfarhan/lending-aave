# 04: Borrow & repay ERC20 + simulasi risiko + test paritas dasar

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa meminjam dan melunasi stablecoin sambil melihat HF dan harga likuidasi sebelum → sesudah, sisa batas pinjam, dan konfirmasi yang makin ketat sesuai risiko. Modul domain dibuktikan sama dengan kontrak lewat test paritas dasar.

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** resolved

- [x] Simulasi borrow/repay di modul domain: posisi sesudah, HF sesudah, harga likuidasi sesudah (Q14, semua varian `kind`: price turun/naik, now, none, mixed, noDebt), sisa batas pinjam sesudah
- [x] Tier #9 untuk borrow: amber (1,5–2,0), wajib centang (1,1–1,5), wajib ketik "confirm" (< 1,1), dikunci "Melebihi batas pinjam" (melewati LTV)
- [x] Harga likuidasi ditulis "Dilikuidasi kalau ETH turun ke $x (−y%)" / "…naik ke $x (+y%)" dengan label "saat ini"; ditampilkan di kepala detail chain dan di panel (Q15)
- [x] Panel borrow menampilkan "Jaminan Anda di <chain>: …"; tanpa jaminan → tombol utama "Supply jaminan dulu" membuka tab Supply (Q11)
- [x] Repay penuh memakai `type(uint256).max` dengan izin berbantalan, tanpa sisa debu bunga (#8)
- [x] **Test paritas dasar** di fork: untuk posisi jaminan ETH + utang stable, posisi campuran, dan posisi dengan aset luar, HF, total jaminan, total utang, dan sisa batas pinjam modul domain = `getUserAccountData`; toleransi sekecil mungkin dan setiap selisih pembulatan dijelaskan sebabnya
- [x] Test Jest modul domain untuk simulasi, harga likuidasi, dan tier #9

## Comments

- 2026-10-27 (implementasi):
  - Modul `src/core/simulate.ts` menghitung ulang `getUserAccountData` dengan pembulatan persis `GenericLogic` v3.7 (jaminan floor, utang `mulDivCeil`, HF `wadDiv`/1e4, sisa batas `percentMulFloor`). Paritas **tanpa toleransi**: 6 posisi fixture (Jest) dan 4 posisi mainnet nyata + 1 posisi campuran buatan app di fork, termasuk sesudah maju 90 hari. Tidak ada selisih pembulatan yang perlu dijelaskan.
  - "Melebihi batas pinjam" memakai aturan `validateHFAndLtv` kontrak (LTV ≠ 0, HF ≥ 1, jaminan ≥ `percentDivCeil(utang, LTV)`); test fork membuktikan batasnya sama dengan titik kontrak mulai revert `CollateralCannotCoverNewBorrow`.
  - Repay lunas penuh: bantalan = bunga 1 hari pada APR pinjaman. **Keputusan**: jumlah yang diisi dianggap "lunas" kalau jumlah + bantalan ≥ utang, karena utang yang terlihat (dan yang dibaca ulang sesudah approve) selalu tertinggal bunga beberapa detik; tanpa ini rencana berubah jadi repay persis sesudah approve dan menyisakan debu. Sisa izin bantalan (≈ bunga yang belum terpakai) tetap ada di Pool sesudah lunas; untuk USDT repay berikutnya jadi butuh reset izin dulu.
  - Konfirmasi #9 terikat pada tier-nya: centang untuk tier `check` nggak meloloskan tier `type` kalau HF sesudah turun karena refetch/oracle.
  - Harga likuidasi "saat ini" tampil di kepala detail chain dan di panel; posisi tanpa ETH (mis. jaminan USDC, utang USDT) = "Tidak dipengaruhi harga ETH". Aset luar yang ikut terhitung → `mixed`; HF < 1 → `now` diperiksa sebelum `mixed`.
  - E-Mode belum dimodelkan (tiket 14): simulasi memakai LT/LTV reserve, jadi untuk user di E-Mode angka "sesudah" dan tier #9 bisa beda dari kontrak. Dicatat di tiket 14.
  - Baris "Utang Anda" (ERC20 whitelist) membuka tab Repay; baris "Pasar pinjam" ERC20 membuka tab Borrow.
