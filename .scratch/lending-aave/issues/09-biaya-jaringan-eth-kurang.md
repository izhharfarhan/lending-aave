# 09: Biaya jaringan + ETH kurang untuk gas

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User melihat perkiraan biaya jaringan sebelum klik, dan kalau ETH-nya kurang, tombol utama sudah berubah jadi "ETH kurang untuk biaya jaringan" beserta perkiraan ETH yang dibutuhkan dan tautan "Cara mendapatkan ETH".

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** ready-for-agent

- [ ] Biaya di panel dari `estimateGas` atas calldata asli, termasuk approve/izin yang masih tersisa (pola Q12 swap)
- [ ] Saldo ETH < biaya → tombol utama nonaktif "ETH kurang untuk biaya jaringan" + perkiraan ETH yang dibutuhkan, sebelum user klik
- [ ] Halaman bantuan "Cara mendapatkan ETH" (exchange / bridge resmi; mode fork → faucet Dev Tools)
- [ ] Perkiraan kasar per chain untuk badge kartu (gasPrice × gas tipikal aksi Aave, dikalibrasi dari `gasUsed` di fork) tersedia untuk dipakai dashboard
- [ ] Test `nextStep` cabang ETH kurang
