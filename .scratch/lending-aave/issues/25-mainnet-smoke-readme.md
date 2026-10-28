# 25: Mode mainnet + smoke test + README

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** App berjalan di mode mainnet lewat Alchemy, diverifikasi dengan transaksi beneran nominal kecil di tiap chain, dan README menjelaskan cara menjalankan semuanya.

**Blocked by:** Semua tiket 01–24

**Status:** ready-for-agent

- [x] Mode mainnet (Alchemy) tanpa Dev Tools dan tanpa pengaman fork
- [ ] Smoke test: supply → borrow → repay nominal kecil di Ethereum, Base, dan Arbitrum; verifikasi L1 fee Base
- [x] README lending-web + lending-indexer: setup env, `anvil:up`, menjalankan app/indexer/test, catatan RPC archive dan EIP-7702, cara memasang font lokal
- [x] Cek `POOL_REVISION` masih 11 di ketiga chain; kalau berubah, cek ulang aturan E-Mode/event sebelum lanjut

## Comments

- 2026-10-28 (dari tiket 19, DECISIONS Q31; dikerjakan di tiket ini, bukan sebelumnya):
  - Indexer mode mainnet memakai key Alchemy **terpisah** dari app/fork lewat env var sendiri (`PONDER_RPC_URL_<chainId>`), supaya kuota indexer yang habis nggak mematikan app dan fork. User yang membuat key-nya; agent cukup menyiapkan nama variabel di `.env.example` tanpa nilai.
  - Ukur pemakaian kuota Alchemy untuk sync live Arbitrum (±4 blok/detik) selama smoke test, dan catat angkanya.
  - README: riwayat dan banner likuidasi di mainnet mulai dari start block indexer; likuidasi sebelum itu nggak tampil.
- 2026-10-28 (persiapan tanpa dana; smoke test dijalankan & ditandatangani user sendiri, agent nggak mengirim tx mainnet):
  - `pnpm check:mainnet` (read-only): `POOL_REVISION` = 11 di Ethereum (blok 26.291.673), Base (53.203.252), Arbitrum (519.066.147). Script yang sama mencetak perkiraan biaya smoke test dari gas saat ini (`STEP_GAS` × gasPrice + L1 fee Base): Ethereum ±$0,63 (0,23 gwei), Base ±$0,02, Arbitrum ±$0,06. Arbitrum memakai kalibrasi gas Ethereum; gas unit Arbitrum biasanya lebih besar, tapi tetap sen.
  - Mode mainnet dicek di browser (build `.next-mainnet` :3202, tanpa wallet & tanpa tx): tanpa banner FORK MODE, Dev Tools, dan connector Anvil; nol request ke port Anvil/indexer lokal; tabel 3 chain terbaca; footer "Indexer offline" (indexer mainnet belum ada).
  - README lending-web (baru) + lending-indexer (bagian "Mode mainnet", `pnpm start-blocks:mainnet`, 0be0a1a). Catatan: ubah `.env.*` → restart dev server (env dibaca saat server mulai).
  - Checklist smoke test: `docs/smoke-test-mainnet.md` (Base → Arbitrum → Ethereum; 0,005 ETH + 2 USDC; perlu ±0,05 USDC tambahan per chain untuk melunasi bunga).
  - `START_BLOCK_<id>` indexer mainnet tetap (diisi sekali), bukan `startBlock: "latest"`: start block berubah = build Ponder baru = index ulang, riwayat hilang.
