# 20: Indexer: semua event, 3 chain

**Repo:** lending-indexer

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Riwayat supply, withdraw, borrow, repay, dan perubahan jaminan di Ethereum, Base, dan Arbitrum tercatat dengan pemilik yang benar, termasuk withdraw ETH lewat gateway.

**Blocked by:** 19 (Indexer tracer (repo lending-indexer))

**Status:** resolved

- [x] Event `Withdraw`, `Borrow`, `Repay`, `ReserveUsedAsCollateralEnabled/Disabled` di 3 chain
- [x] Pemilik (#11): Supply/Borrow → `onBehalfOf`; Repay/Withdraw → `user`; withdraw ETH: `Withdraw.user` = gateway, pemilik dari `Transfer` aWETH user → gateway di tx yang sama (V2)
- [x] Event jaminan otomatis (supply pertama, saldo habis) digabung ke baris tx-nya; baris Collateral hanya untuk toggle manual (V3, Q18)
- [x] API GraphQL: riwayat semua chain per alamat dengan filter chain + jenis, plus status sinkron per chain
- [x] Test Vitest untuk atribusi pemilik (depositETH, borrowETH, withdrawETH) dan penggabungan event jaminan

## Comments

- 2026-10-28 (selesai, lending-indexer ac4bedc + a3dcccc): `position_event` sekarang punya jenis `supply/withdraw/borrow/repay/collateral`, kolom `collateralEnabled` (null = jaminan nggak berubah), `amount` kosong di baris collateral. Aturan pemilik di `src/core/positionEvent.ts`, penggabungan di `src/core/collateralMerge.ts` (tabel bantu `tx_slot`; Ponder cuma bisa `find` lewat primary key). withdrawETH: `Transfer` aWETH difilter `to = gateway` di config Ponder (tabel `gateway_transfer`).
  - Status sinkron per chain = `_meta { status }` bawaan Ponder, dikunci nama chain (`mainnet`/`base`/`arbitrum`), bukan chainId: tiket 22 perlu memetakannya.
  - Test integrasi 3 Anvil (:48555/6/7). Run pertama gagal di 3 tx test (supply USDC kedua, repayETH, withdrawETH Arbitrum) dengan gas = estimasi polos; **penyebab belum diketahui**, out-of-gas TIDAK terbukti. Dicek 2026-10-28: reproduksi repayETH terisolasi dan urutan persis run itu (12 tx, tanpa Ponder) sukses dengan gasUsed 4–8% di bawah estimasi; run integrasi penuh tanpa margin (Ponder jalan, jeda polling `waitForRows`) lolos 14/14, jadi hipotesis "jeda antar-tx menggeser akrual bunga" juga nggak terbukti. Margin +20% tetap dipasang sebagai pengaman; pesan gagal di `test/integration/aave.ts` kini mencatat gasUsed/limit/estimasi, ringkasan `debug_traceTransaction` (revert vs kehabisan gas), dan timestamp blok estimasi vs tambang, supaya kalau terulang buktinya ada.
  - **Batasan (diputuskan user 2026-10-28: dibiarkan, terdokumentasi di README indexer; app EOA-only, dan perbaikannya menambah RPC per event di mainnet)**: transfer seluruh aToken ke alamat lain tercatat sebagai baris `collateral` seperti toggle manual; dalam tx batch smart wallet, toggle manual searah sebelum supply/withdraw di reserve yang sama ikut tergabung. Membedakannya butuh baca saldo aToken di blok −1 per event.
- 2026-10-28 (cek `dev:fork` terhadap Anvil dev 3 chain, sesudah `db:reset:fork`): live di ketiga chain; 10 log Pool sesudah pin (dicek langsung `eth_getLogs`) = 7 baris riwayat, semua milik akun tes, supply ETH lewat gateway tercatat `owner` = user / `caller` = gateway, 3 `ReserveUsedAsCollateralEnabled` tergabung ke Supply-nya. Di v3.7 event jaminan otomatis supply terpancar **sebelum** `Supply` (log 5 → 6). `_meta.status` sama dengan blok terbaru tiap Anvil. State dev nggak diubah (withdraw/repay/withdrawETH cuma tercakup test integrasi).
