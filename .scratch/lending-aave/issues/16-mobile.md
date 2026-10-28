# 16: Tampilan mobile

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User mobile (390px) bisa memakai semua fitur dashboard: panel aksi muncul sebagai bottom sheet layar penuh dengan tombol utama menempel di bawah (Q19).

**Blocked by:** 11 (Dashboard: hero + segmen chain + banner Bahaya)

**Status:** resolved

- [x] Bottom sheet layar penuh untuk panel aksi; tombol utama menempel di bawah sheet
- [x] Bar Supply/Borrow menempel di bawah layar untuk membuka sheet
- [x] Segmen chain bisa digeser horizontal; tabel ringkas (kolom sekunder disembunyikan)
- [x] Tanpa scroll horizontal halaman di 390px

## Comments

- 2026-10-28: mobile = di bawah breakpoint `md` (768px), sama dengan hilangnya sidebar; md–xl tetap memakai tata letak lama (panel di bawah tabel). Sheet ditutup = disembunyikan, bukan dilepas, supaya transaksi yang sedang jalan dan progresnya tetap ada. Kolom sekunder yang disembunyikan: "Jaminan" di Pasar supply (infonya pindah jadi "✓ bisa jaminan" di samping nama aset). "Detail parameter" tetap digulir horizontal di dalam kotaknya sendiri. Dicek di Playwright 390px: tanpa scroll horizontal halaman, bar → tab yang benar, baris tabel → sheet, Escape/Tutup, fokus kembali ke pemicu, tombol utama menempel saat sheet digulir, panel penyelamatan dari banner bisa dibuka lagi setelah ditutup.
