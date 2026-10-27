# 25: Mode mainnet + smoke test + README

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** App berjalan di mode mainnet lewat Alchemy, diverifikasi dengan transaksi beneran nominal kecil di tiap chain, dan README menjelaskan cara menjalankan semuanya.

**Blocked by:** Semua tiket 01–24

**Status:** ready-for-agent

- [ ] Mode mainnet (Alchemy) tanpa Dev Tools dan tanpa pengaman fork
- [ ] Smoke test: supply → borrow → repay nominal kecil di Ethereum, Base, dan Arbitrum; verifikasi L1 fee Base
- [ ] README lending-web + lending-indexer: setup env, `anvil:up`, menjalankan app/indexer/test, catatan RPC archive dan EIP-7702, cara memasang font lokal
- [ ] Cek `POOL_REVISION` masih 11 di ketiga chain; kalau berubah, cek ulang aturan E-Mode/event sebelum lanjut
