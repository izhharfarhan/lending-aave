# 06: Supply & repay ETH lewat WrappedTokenGateway

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa supply dan repay memakai ETH langsung, tanpa langkah approve, dan kelebihan ETH saat repay dikembalikan otomatis.

**Blocked by:** 04 (Borrow & repay ERC20 + simulasi risiko + test paritas dasar)

**Status:** ready-for-agent

- [ ] Supply ETH lewat `depositETH` (onBehalfOf = user), tanpa approve
- [ ] Repay ETH lewat `repayETH` dengan ETH berbantalan; kelebihan di-refund gateway; repay penuh tanpa debu
- [ ] Daftar langkah wallet menampilkan WrappedTokenGateway sebagai alamat resmi tujuan
- [ ] ETH dan WETH diperlakukan sebagai aset yang sama di tampilan posisi
- [ ] Test `nextStep` (tanpa langkah approve) dan supply/repay ETH di fork
