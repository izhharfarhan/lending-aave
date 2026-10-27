# 07: Withdraw ETH + borrow ETH lewat WrappedTokenGateway

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa menarik dan meminjam ETH langsung. Withdraw meminta izin aWETH ke gateway (berbantalan supaya withdraw semua nggak gagal karena bunga), dan borrow meminta izin berutang atas nama user (credit delegation), masing-masing dijelaskan sebelum popup wallet.

**Blocked by:** 05 (Withdraw ERC20 + toggle jaminan), 06 (Supply & repay ETH lewat WrappedTokenGateway)

**Status:** ready-for-agent

- [ ] Withdraw ETH: langkah "Approve aWETH ke WrappedTokenGateway" dijelaskan; izin berbantalan; withdraw semua memakai `type(uint256).max` dan nggak gagal karena saldo aWETH bertambah oleh bunga (V2, #8)
- [ ] Borrow ETH: langkah "Izinkan gateway berutang atas nama Anda" (`approveDelegation`) dijelaskan
- [ ] `withdrawETHWithPermit` tidak dipakai
- [ ] Test `nextStep` untuk kedua izin, dan withdraw semua ETH + borrow ETH di fork (termasuk setelah maju waktu supaya bunga bertambah)
