# 08: MAX per aksi + kapasitas pool

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Tombol MAX selalu mengisi jumlah terbesar yang benar-benar bisa dieksekusi, dan aksi yang pasti ditolak kontrak karena kapasitas pool dikunci dengan pesan jelas sebelum user membayar gas.

**Blocked by:** 07 (Withdraw ETH + borrow ETH lewat WrappedTokenGateway), 09 (Biaya jaringan + ETH kurang untuk gas)

**Status:** ready-for-agent

- [ ] MAX sesuai Q26: supply ETH = saldo − cadangan gas (pola `maxSpendable` swap-web); supply ERC20 = saldo wallet; withdraw = min(saldo supply, batas LTV, likuiditas) dan "withdraw semua" → `type(uint256).max`; borrow = sampai batas LTV dibatasi borrow cap dan likuiditas; repay = min(utang, saldo wallet), ETH sisakan gas, `type(uint256).max` hanya kalau saldo ≥ utang + bantalan
- [ ] **Cadangan gas untuk MAX ETH** (supply ETH dan repay ETH), pola `maxSpendable` swap-web tiket 14: `cadangan = max(minimum per chain, fee × 2)`, dengan minimum Ethereum 0,0005 ETH dan Base/Arbitrum 0,00005 ETH. `fee` = biaya jaringan tx yang tersisa dari tiket 09 (termasuk approve/izin yang belum ada); kalau fee belum diketahui, pakai minimum chain. Hasil MAX = saldo ETH − cadangan, dibulatkan ke bawah ke 6 desimal; saldo ≤ cadangan → MAX 0. ERC20 tanpa cadangan (gas dibayar dari saldo ETH terpisah)
- [ ] MAX borrow tetap memicu tier #9 (centang / ketik confirm) untuk jumlah hasilnya
- [ ] Kapasitas pool sesuai V8: supply cap, borrow cap (0 = tanpa batas), likuiditas = `virtualUnderlyingBalance`
- [ ] Tombol dikunci dengan pesan "Kuota supply aset ini penuh" / "Kuota pinjaman aset ini penuh" / "Likuiditas pool tidak cukup, tersedia X" (urutan `nextStep` langkah kapasitas)
- [ ] Field isolation mode lama (debtCeiling, borrowableInIsolation, isolationModeTotalDebt, isSiloedBorrowing) diabaikan; fixture dengan nilai bukan nol tidak mengubah hasil (Q28)
- [ ] Test Jest modul domain + `nextStep` untuk semua kasus MAX dan kapasitas
