# 10: Base + Arbitrum + pilih chain

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa memilih Ethereum, Base, atau Arbitrum (tercatat di URL) tanpa popup wallet, dan baru diminta ganti network saat mau bertransaksi. Fork 3 chain berjalan dengan satu Anvil per chain.

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** ready-for-agent

- [ ] Config per chain: alamat dari address-book + whitelist berbasis alamat (Base WETH/ETH, USDC; Arbitrum WETH/ETH, USDCn, USDT). Menambah chain = menambah satu entri
- [ ] USDC.e Arbitrum dan USDbC Base hanya muncul sebagai aset luar
- [ ] Pilih chain = `?chain=` di URL, tanpa `switchChain` (Q5)
- [ ] Langkah "Ganti ke <chain>" di `nextStep` saat wallet di network lain; penolakan ditangani
- [ ] Biaya jaringan Base termasuk L1 fee
- [ ] `anvil:up` untuk 3 chain (RPC archive, `anvil_setCode` semua akun tes di tiap chain)
- [ ] Test fork khusus chain: Base (L1 fee, tanpa USDT), Arbitrum (USDCn vs USDC.e frozen sebagai aset luar); satu Anvil per chain seperti swap-web tiket 17/17b
