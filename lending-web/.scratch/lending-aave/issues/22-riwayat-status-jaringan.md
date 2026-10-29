# 22: Halaman riwayat + status jaringan

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User membuka halaman Riwayat dan melihat semua transaksi di 3 chain dalam satu daftar, dengan transaksi barunya langsung muncul walau indexer belum menyusul, dan sidebar menunjukkan status tiap chain serta indexer.

**Blocked by:** 20 (Indexer: semua event, 3 chain), 10 (Base + Arbitrum + pilih chain)

**Status:** resolved

- [x] Riwayat lokal + indexer digabung dan dideduplikasi berdasarkan txHash (pola Q17 swap)
- [x] Filter chain + jenis (Supply/Withdraw/Borrow/Repay/Likuidasi/Collateral); terbaru di atas
- [x] Badge "Riwayat mungkin belum lengkap" kalau indexer tertinggal/mati
- [x] Waktu relatif ("x menit lalu") dihitung dari timestamp blok terbaru chain itu, bukan `Date.now()` (Q30); benar setelah "maju waktu" di fork
- [x] Footer sidebar: blok terbaru per chain, status RPC, status indexer (sinkron / tertinggal N blok / offline)
- [x] Test Jest untuk penggabungan riwayat dan waktu relatif dari timestamp blok

## Comments

- 2026-10-28 (selesai): halaman `/riwayat` (`app/HistoryView.tsx`), footer "Status jaringan" di `app/Sidebar.tsx` + `MobileNav` (sidebar tersembunyi di bawah md). Core: `core/history.ts` (`toIndexedEntry`, `mergeHistory` dedup per chain + txHash, `filterHistory`), `core/indexerStatus.ts` (`indexerChainStatus`, `indexerSummary`), `historyAge` di `core/relativeTime.ts`. Data: `aave/fetchIndexer.ts`, `aave/useNetworkStatus.ts` (head 3 chain + `_meta` dalam satu query tiap 15 dtk), `aave/useHistory.ts`. `SupportedChain.indexerMaxLagBlocks` 5/30/240. Env `NEXT_PUBLIC_INDEXER_URL` (fork: http://localhost:42070; kosong = offline).
  - Dicek di browser (build :3201 terhadap Anvil dev + indexer dev:fork, tanpa tx): 7 baris indexer, filter, footer, dedup hash huruf besar, "Menunggu indexer", "Gagal", indexer diblokir → badge + footer offline, 390 px tanpa scroll horizontal.
  - Urutan lintas chain = timestamp blok mentah (keputusan tiket 19), umur = terhadap blok terbaru chain-nya (Q30). Di fork, sesudah "maju waktu" di satu chain, keduanya bisa terlihat bertentangan (baris "2585 hari lalu" di atas baris "10 menit lalu"); di mainnet jam chain ≈ sama, jadi identik. Dibiarkan.
  - RPC satu chain gagal → status indexer chain itu nggak dinilai (pola swap-web); footer menulis "RPC gagal".
  - Baris lokal yang masih "menunggu indexer" belum tahu jaminan otomatisnya ("· jaminan aktif" muncul sesudah indexer menyusul).
  - **Untuk tiket 23**: `fetchIndexer` sudah mengambil seluruh `LiquidationDetail` (`item.entry.liquidation`); baris likuidasi di Riwayat baru menulis "jaminan dijual <x>" dan "sisa utang dihapus" **tanpa jumlah**. GLOSSARY meminta "sisa utang <x> dihapus": jumlahnya diisi di rincian tiket 23.
