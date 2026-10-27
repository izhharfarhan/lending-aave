# 20: Indexer: semua event, 3 chain

**Repo:** lending-indexer

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Riwayat supply, withdraw, borrow, repay, dan perubahan jaminan di Ethereum, Base, dan Arbitrum tercatat dengan pemilik yang benar, termasuk withdraw ETH lewat gateway.

**Blocked by:** 19 (Indexer tracer (repo lending-indexer))

**Status:** ready-for-agent

- [ ] Event `Withdraw`, `Borrow`, `Repay`, `ReserveUsedAsCollateralEnabled/Disabled` di 3 chain
- [ ] Pemilik (#11): Supply/Borrow → `onBehalfOf`; Repay/Withdraw → `user`; withdraw ETH: `Withdraw.user` = gateway, pemilik dari `Transfer` aWETH user → gateway di tx yang sama (V2)
- [ ] Event jaminan otomatis (supply pertama, saldo habis) digabung ke baris tx-nya; baris Collateral hanya untuk toggle manual (V3, Q18)
- [ ] API GraphQL: riwayat semua chain per alamat dengan filter chain + jenis, plus status sinkron per chain
- [ ] Test Vitest untuk atribusi pemilik (depositETH, borrowETH, withdrawETH) dan penggabungan event jaminan
