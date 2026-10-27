# 11: Dashboard: hero + segmen chain + banner Bahaya

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User pro membuka app dan langsung melihat posisi semua chain: HF terendah sebagai angka raksasa, skala HF dengan penanda tiap chain, total supply/utang/net, batas pinjam terpakai tertinggi, segmen ringkas per chain, dan banner Bahaya kalau ada chain dengan HF < 1,5 (ADR 0001).

**Blocked by:** 10 (Base + Arbitrum + pilih chain), 04 (Borrow & repay ERC20 + simulasi risiko + test paritas dasar)

**Status:** ready-for-agent

- [ ] Posisi 3 chain dibaca paralel (satu multicall per chain)
- [ ] Ringkasan di modul domain: HF terendah dari chain berutang saja, total supply/utang/net (USD harga oracle), batas pinjam terpakai **tertinggi per chain** (Q24), daftar chain berbahaya
- [ ] Hero: angka HF terendah raksasa (aksen kalau Aman, amber/merah kalau Waspada/Bahaya), skala 1,0 → 1,5 → 2,0 → 3,0+ dengan penanda per chain yang bisa diklik, statistik bersekat, bar "Batas pinjam terpakai · tertinggi: <chain> x% · sisa $y" berwarna tier HF chain itu; tanpa utang → bar disembunyikan
- [ ] Segmen chain: HF (berwarna hanya Waspada/Bahaya), supply, utang, garis pemakaian batas pinjam berwarna tier, harga likuidasi untuk chain Bahaya, badge "ETH kurang untuk bertransaksi", "Belum ada posisi · <saldo terbesar> di wallet bisa di-supply" (Q21)
- [ ] Banner Bahaya menempel di atas hero: chain HF terendah dulu + "+N chain lain", tetap tampil walau chain lain dipilih; Waspada tanpa banner (Q2)
- [ ] Pemicu banner diverifikasi di fork: posisi dibuat sampai HF < 1,5 (lewat borrow, atau alat ubah harga dari tiket 18 kalau sudah ada)
- [ ] Satu animasi masuk bertahap (hero → segmen → tabel), mati dengan `prefers-reduced-motion`
- [ ] Test Jest ringkasan semua chain (HF terendah, batas pinjam tertinggi, chain berbahaya, tanpa utang)
