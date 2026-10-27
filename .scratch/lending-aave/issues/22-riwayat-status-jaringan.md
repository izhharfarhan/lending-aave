# 22: Halaman riwayat + status jaringan

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User membuka halaman Riwayat dan melihat semua transaksi di 3 chain dalam satu daftar, dengan transaksi barunya langsung muncul walau indexer belum menyusul, dan sidebar menunjukkan status tiap chain serta indexer.

**Blocked by:** 20 (Indexer: semua event, 3 chain), 10 (Base + Arbitrum + pilih chain)

**Status:** ready-for-agent

- [ ] Riwayat lokal + indexer digabung dan dideduplikasi berdasarkan txHash (pola Q17 swap)
- [ ] Filter chain + jenis (Supply/Withdraw/Borrow/Repay/Likuidasi/Collateral); terbaru di atas
- [ ] Badge "Riwayat mungkin belum lengkap" kalau indexer tertinggal/mati
- [ ] Waktu relatif ("x menit lalu") dihitung dari timestamp blok terbaru chain itu, bukan `Date.now()` (Q30); benar setelah "maju waktu" di fork
- [ ] Footer sidebar: blok terbaru per chain, status RPC, status indexer (sinkron / tertinggal N blok / offline)
- [ ] Test Jest untuk penggabungan riwayat dan waktu relatif dari timestamp blok
