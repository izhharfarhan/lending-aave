# 18: Dev Tools: ubah harga oracle + simulasi likuidasi

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Developer bisa menurunkan/menaikkan harga ETH di oracle Aave fork dan melikuidasi posisi akun tes dari akun lain, supaya tier #9, harga likuidasi, banner Bahaya, dan alur likuidasi bisa diuji lebih awal.

**Blocked by:** 17 (Dev Tools dasar + maju waktu), 04 (Borrow & repay ERC20 + simulasi risiko + test paritas dasar)

**Status:** ready-for-agent

- [ ] Ubah harga sesuai V7: deploy mock aggregator (`latestAnswer`, 8 desimal) → impersonate `ACL_ADMIN` (punya `POOL_ADMIN`) → `AaveOracle.setAssetSources([aset], [mock])` → selanjutnya cukup `mock.setAnswer`
- [ ] Simulasi likuidasi: akun tes likuidator (sudah dibersihkan dari 7702) memanggil `Pool.liquidationCall` terhadap posisi user tes
- [ ] Test fork: harga diturunkan → HF dan harga likuidasi di modul domain berubah sesuai; likuidasi berhasil saat HF < 1
