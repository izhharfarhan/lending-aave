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
- 2026-10-28 (sesudah review user): tampil-sembunyi sheet/bar kini murni CSS (`max-md:` di satu host panel, tanpa portal dan tanpa menunggu `useMobile`), jadi render pertama di HP nggak pernah memunculkan panel di halaman. Wrapper detail chain di mobile cuma memudar (`reveal-holds-sheet`), karena transform animasi membuat `fixed` ikut kotaknya. RescuePanel nggak menggulir halaman di mobile. Breakpoint ditulis eksplisit `--breakpoint-md` di globals.css ↔ `MOBILE_QUERY` di MobileSheet.tsx, saling menunjuk. Dicek di Playwright 390px dengan sampel tiap frame: buka langsung `?chain=base&panel=penyelamatan`, sambungkan wallet dari sheet → 0 frame panel di luar sheet fixed, scrollY tetap 0. Catatan: konektor Anvil (`mock`) nggak menyambung ulang setelah reload, jadi skenario "sudah tersambung lalu URL dibuka" nggak bisa direproduksi persis di fork.
