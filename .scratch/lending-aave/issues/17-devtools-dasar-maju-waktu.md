# 17: Dev Tools dasar + maju waktu

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Di mode fork, developer punya panel Dev Tools seperti swap-web, plus tombol maju waktu supaya bunga dan perubahan HF bisa dilihat tanpa menunggu.

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** ready-for-agent

- [ ] Fitur Dev Tools swap-web: simulasi reject (tx, signature, switchChain), latency, faucet
- [ ] Maju waktu +1 hari / +30 hari / +1 tahun (`evm_increaseTime` + mine), posisi di-refetch setelahnya
- [ ] Hanya tampil di mode fork
