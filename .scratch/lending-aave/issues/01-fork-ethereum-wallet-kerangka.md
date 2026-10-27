# 01: Fork Ethereum + wallet + pengaman + kerangka tampilan

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Developer bisa menyalakan Anvil fork Ethereum yang di-pin dengan satu perintah, membuka app di FORK MODE, connect pakai connector fork lokal, dan melihat saldo ETH akun tes di dalam kerangka tampilan final (sidebar, token warna, font). Sejak hari pertama app nggak mungkin mengirim tx ke mainnet waktu mengira sedang di fork, dan akun tes bebas dari delegasi EIP-7702.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Perintah `anvil:up` menyalakan fork Ethereum di blok yang di-pin dan **menolak RPC non-archive** (pelajaran tiket 01 swap-web dan V7)
- [ ] Saat fork dinyalakan, `anvil_setCode(akun, 0x)` dijalankan untuk **semua** akun tes yang dipakai, termasuk akun likuidator Dev Tools (bukan cuma akun #0 seperti swap-web)
- [ ] Mode fork/mainnet dipilih lewat file env per mode; `.env.example` berisi nama variabel tanpa nilai
- [ ] Alamat kontrak Aave Ethereum (Pool, WrappedTokenGateway, UiPoolDataProvider, AaveOracle, ACL_ADMIN) diambil dari `@bgd-labs/aave-address-book`
- [ ] wagmi + RainbowKit terpasang, EOA-only; connector fork lokal (akun Anvil unlocked)
- [ ] Banner FORK MODE + pengaman fork (connector bukan lokal atau blok tidak cocok → aksi dikunci), mengikuti pola `forkGuard` swap-web
- [ ] Kerangka tampilan sesuai Q20 dan prototype `prototype/dashboard`: sidebar (wordmark, Dashboard, Riwayat, E-Mode redup + SEGERA), token warna di CSS variable dengan aksen violet, font Unbounded/IBM Plex Sans/IBM Plex Mono
- [ ] Saldo ETH akun tes tampil setelah connect
