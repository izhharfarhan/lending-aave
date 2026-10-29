# 13: Panel penyelamatan dari banner Bahaya

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Dari banner Bahaya, user pro klik "Lihat <chain>" dan mendapat dua pilihan, Repay atau Supply jaminan, masing-masing dengan HF sesudah, lalu memilih salah satu (J3, Q29).

**Blocked by:** 11 (Dashboard: hero + segmen chain + banner Bahaya), 08 (MAX per aksi + kapasitas pool)

**Status:** resolved

- [x] "Lihat <chain>" memilih chain itu dan membuka panel penyelamatan, bukan langsung tab Repay
- [x] HF sesudah untuk Repay dihitung dari MAX repay (Q26); untuk Supply jaminan dari saldo wallet aset jaminan yang tersedia
- [x] Memilih salah satu membuka tab aksinya dengan jumlah kosong
- [x] Test Jest modul domain untuk HF sesudah kedua pilihan
