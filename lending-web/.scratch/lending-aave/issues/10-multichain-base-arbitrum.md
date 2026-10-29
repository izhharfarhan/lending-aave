# 10: Base + Arbitrum + pilih chain

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa memilih Ethereum, Base, atau Arbitrum (tercatat di URL) tanpa popup wallet, dan baru diminta ganti network saat mau bertransaksi. Fork 3 chain berjalan dengan satu Anvil per chain.

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** resolved

- [x] Config per chain: alamat dari address-book + whitelist berbasis alamat (Base WETH/ETH, USDC; Arbitrum WETH/ETH, USDCn, USDT). Menambah chain = menambah satu entri
- [x] USDC.e Arbitrum dan USDbC Base hanya muncul sebagai aset luar
- [x] Pilih chain = `?chain=` di URL, tanpa `switchChain` (Q5)
- [x] Langkah "Ganti ke <chain>" di `nextStep` saat wallet di network lain; penolakan ditangani
- [x] Biaya jaringan Base termasuk L1 fee
- [x] `anvil:up` untuk 3 chain (RPC archive, `anvil_setCode` semua akun tes di tiap chain)
- [x] Test fork khusus chain: Base (L1 fee, tanpa USDT), Arbitrum (USDCn vs USDC.e frozen sebagai aset luar); satu Anvil per chain seperti swap-web tiket 17/17b

## Comments

- Implementasi:
  - `config/chains.ts` `SUPPORTED_CHAINS`: satu entri per chain (viem chain, explorer, lantai cadangan gas, alamat Aave dari address-book, whitelist berbasis alamat). `AAVE`, `WHITELIST`, dan explorer diturunkan dari situ. Arbitrum: USDC native (address-book `USDCn`) tampil "USDC"; USDT (USD₮0) tanpa reset izin. Base: ETH + USDC saja. USDC.e / USDbC otomatis aset luar karena nggak di whitelist.
  - `?chain=<slug>` dibaca `page.tsx` (`chainFromParam`, default Ethereum); pemilih chain sederhana berupa tautan (kartu chain menyusul di tiket 11), tanpa popup wallet.
  - `nextStep` langkah `switchChain { chainId }`: menggantikan langkah wallet pertama kalau network wallet ≠ chain terpilih (sesudah semua cek lain). Penolakan / gagal ganti network → pesan di panel (`switchChainErrorKind`), network tetap.
  - Biaya jaringan dihitung di chain terpilih walau wallet masih di network lain (`stepBeforeGasCheck` menetralkan network). Base: L1 fee per transaksi (`fetchNetworkFee` mengembalikan `{ wei, l1Fee }`).
  - Fork: `forkChains.json` Base 52.975.000 (port 8556) dan Arbitrum 517.470.000 (port 8557), blok pin sama dengan swap-web supaya cache RPC Foundry kepake bareng. `anvil:up` sudah generik per entri (termasuk `anvil_setCode` akun tes). Test fork satu project Jest per chain (pola swap-web 17b): `*.base.fork.spec.ts`, `*.arbitrum.fork.spec.ts`, port test 18556/18557.
  - Test khusus chain: Base (whitelist tanpa USDT, USDbC sebagai aset luar, L1 fee > 0, supply ETH lewat gateway Base), Arbitrum (USDC native vs USDC.e Dibekukan sebagai aset luar, supply USDC native lewat app).
- Catatan:
  - Token tes L2 diambil dari aToken reserve-nya sendiri (belum ada holder EOA yang dicek di L2); cukup untuk jumlah kecil. **Aturan (user, 2026-10-28):** sebelum menambah test L2 yang bergantung pada likuiditas pool (withdraw/borrow besar, kapasitas, likuiditas), ganti dulu ke holder EOA yang dicek di blok pin (`HOLDERS` di `test/fork/fund.ts`), karena mengambil dari aToken membuat saldo underlying-nya lebih kecil dari `virtualUnderlyingBalance`.
  - `ACL_ADMIN` terbukti pool admin juga di Arbitrum (fork test `setReserveFreeze` lolos); helper `asPoolAdmin` tetap mengeceknya lewat ACLManager.
  - USDbC Base: kuota supply-nya sudah lewat (`SupplyCapExceeded`) selain sedang dihapus bertahap; posisi test disiapkan dengan membuka cap sebentar lalu mengembalikannya (`supplyToReserve`).
  - Fork Base & Arbitrum dingin (run pertama) makan >10 menit per file; sesudah cache Foundry hangat jauh lebih cepat.
