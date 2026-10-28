# 18: Dev Tools: ubah harga oracle + simulasi likuidasi

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Developer bisa menurunkan/menaikkan harga ETH di oracle Aave fork dan melikuidasi posisi akun tes dari akun lain, supaya tier #9, harga likuidasi, banner Bahaya, dan alur likuidasi bisa diuji lebih awal.

**Blocked by:** 17 (Dev Tools dasar + maju waktu), 04 (Borrow & repay ERC20 + simulasi risiko + test paritas dasar)

**Status:** resolved

- [x] Ubah harga sesuai V7: deploy mock aggregator (`latestAnswer`, 8 desimal) → impersonate `ACL_ADMIN` (punya `POOL_ADMIN`) → `AaveOracle.setAssetSources([aset], [mock])` → selanjutnya cukup `mock.setAnswer`
- [x] Simulasi likuidasi: akun tes likuidator (sudah dibersihkan dari 7702) memanggil `Pool.liquidationCall` terhadap posisi user tes
- [x] Test fork: harga diturunkan → HF dan harga likuidasi di modul domain berubah sesuai; likuidasi berhasil saat HF < 1

## Comments

- 2026-10-28 (selesai): grup "Harga oracle" dan "Likuidasi" di panel Dev Tools, aksi di `src/devtools/forkActions.ts`, test `src/devtools/oracleLiquidation.fork.spec.ts`.
  - Mock aggregator dipasang lewat `anvil_setCode` (alamat tetap per aset) dan harganya ditulis lewat `anvil_setStorageAt`, bukan deploy + `setAnswer`; slot kedua menyimpan sumber asli untuk "Harga asli". Dicatat di DECISIONS V7.
  - Harga bisa diatur untuk semua aset whitelist chain terpilih (story 120 menyebut ETH). `ACL_ADMIN` punya POOL_ADMIN di ketiga chain (dicek di fork).
  - Likuidasi: akun likuidator diisi token utang + 1% lewat faucet, approve (reset dulu kalau ada sisa izin, untuk USDT), lalu `liquidationCall(debtToCover = max, receiveAToken = false)`. Yang dilikuidasi = akun yang tersambung.
  - Catatan v3.7 untuk test & indexer: sisa utang/jaminan < $1.000 sesudah likuidasi 50% (`MIN_LEFTOVER_BASE`) membuat close factor jadi 100%, dan jaminan yang habis membuat sisa utang dihapus (deficit). Posisi kecil di dev fork (±$1.400 utang) selalu terlikuidasi habis.
