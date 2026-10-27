# 03: Supply ERC20 (tracer transaksi)

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User klik baris USDC di Pasar supply, mengisi jumlah, melihat daftar "Yang akan diminta wallet" (approve exact ke Aave Pool, lalu supply) lengkap dengan alamat resmi dan tautan explorer, lalu mengikuti status transaksi multi-tahap sampai posisinya terupdate. Ini jalur transaksi pertama dari ujung ke ujung.

**Blocked by:** 02 (Baca posisi Ethereum (read-only))

**Status:** ready-for-agent

- [ ] Klik baris tabel membuka panel aksi di samping detail chain (tab Supply/Withdraw/Borrow/Repay), baris yang dibuka ditandai
- [ ] Input jumlah dengan koma desimal, padanan USD, dan bunga per tahun
- [ ] `nextStep` murni (pola swap-web) untuk cabang: belum connect, data belum siap, tx berjalan, jumlah kosong, saldo kurang, approve exact, tx utama
- [ ] Approve default exact; unlimited hanya pilihan eksplisit user, dengan teks risiko + link revoke.cash (pola Q7 swap)
- [ ] Daftar langkah wallet inline di atas tombol utama: judul, penjelasan, alamat kontrak, "✓ alamat resmi Aave" (dari address-book), tautan explorer (Q9)
- [ ] Catatan "smart account activation / gas gratis" yang bisa ditutup dan nggak muncul lagi
- [ ] Status tx per langkah: menunggu konfirmasi di wallet → menunggu jaringan → selesai + tautan explorer; ditolak di wallet → pesan + "Coba lagi"
- [ ] Setelah sukses, posisi di-refetch dan tx masuk riwayat lokal
- [ ] Error wallet dan kontrak diterjemahkan ke bahasa Indonesia (pola `walletError` swap-web)
- [ ] Test: `nextStep` (Jest) dan supply USDC di fork (Jest fork, snapshot/revert)
