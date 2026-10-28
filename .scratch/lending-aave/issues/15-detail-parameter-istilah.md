# 15: Detail parameter + istilah

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User pro bisa membuka angka lengkap tiap reserve, dan user menengah mendapat penjelasan sederhana untuk istilah Aave tanpa istilahnya diganti (progressive disclosure, Q7/Q8).

**Blocked by:** 02 (Baca posisi Ethereum (read-only))

**Status:** ready-for-agent

- [ ] "Detail parameter <chain>" ▾: LTV, liquidation threshold, liquidation penalty, utilization, reserve factor, supply/borrow cap, harga oracle, alamat reserve/aToken; status buka/tutup diingat di localStorage
- [ ] Istilah asli Aave tetap dipakai dengan ⓘ dan penjelasan sederhana (mis. "Health factor 1,82 · Aman ⓘ")
- [ ] APY ditulis sebagai "bunga per tahun" di tampilan awal
- [ ] Copy UI bahasa Indonesia baku dengan "Anda", terkumpul di satu modul copy

## Comments

- 2026-10-28 (dari tiket 14): label on-chain kategori E-Mode user (`ChainView.eMode.label`) tampil di "Detail parameter <chain>" (spec story 56, V4). Baris "E-Mode aktif · jaminan · pinjaman" di kepala detail chain sengaja tanpa label.
