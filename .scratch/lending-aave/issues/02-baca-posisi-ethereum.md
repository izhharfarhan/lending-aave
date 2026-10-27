# 02: Baca posisi Ethereum (read-only)

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User yang connect melihat detail chain Ethereum: tabel Supply Anda, Utang Anda, Pasar supply, dan Pasar pinjam, dengan HF, tingkat risiko, dan sisa batas pinjam yang benar. User yang belum connect tetap bisa melihat daftar aset dan APY. Ini juga melahirkan modul domain murni (seam utama Q25) beserta fixture on-chain asli.

**Blocked by:** 01 (Fork Ethereum + wallet + pengaman + kerangka tampilan)

**Status:** ready-for-agent

- [ ] Data dibaca lewat satu multicall: `UiPoolDataProviderV3` (reserve + posisi user) dan `Pool.getUserAccountData`
- [ ] Whitelist berbasis **alamat** per chain (Ethereum WETH/ETH, USDC, USDT); parameter (LTV, LT, APY, flag) dibaca dari kontrak, tidak di-hardcode
- [ ] Modul domain murni menghasilkan tampilan posisi: HF, tingkat risiko (Aman ≥ 2,0 · Waspada 1,5–2,0 · Bahaya < 1,5; Aman netral, Waspada amber, Bahaya merah), total jaminan/utang, sisa batas pinjam, batas pinjam terpakai
- [ ] HF, total, dan sisa batas pinjam **saat ini** yang ditampilkan berasal dari `getUserAccountData`; tanpa utang ditulis "Tidak ada utang", bukan "∞"
- [ ] Aset luar tampil read-only "aset luar · dikelola di app.aave.com ↗" dan tetap ikut terhitung
- [ ] Posisi di reserve frozen/paused tetap tampil dengan label **Dibekukan** / **Dijeda**; reserve frozen/paused/nonaktif tidak muncul di Pasar supply/pinjam (#4)
- [ ] Pasar supply menyembunyikan saldo wallet 0, dengan toggle "Tampilkan semua"; Pasar pinjam ikut `borrowingEnabled`
- [ ] Tabel datar dengan logo token inisial di lingkaran berwarna (prototype)
- [ ] Belum connect: daftar aset + APY read-only dan ajakan connect (Q6)
- [ ] Test Jest modul domain (positive/negative/edge) dengan fixture dari data on-chain asli
