# 03: Supply ERC20 (tracer transaksi)

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User klik baris USDC di Pasar supply, mengisi jumlah, melihat daftar "Yang akan diminta wallet" (approve exact ke Aave Pool, lalu supply) lengkap dengan alamat resmi dan tautan explorer, lalu mengikuti status transaksi multi-tahap sampai posisinya terupdate. Ini jalur transaksi pertama dari ujung ke ujung.

**Blocked by:** 02 (Baca posisi Ethereum (read-only))

**Status:** resolved

- [x] Klik baris tabel membuka panel aksi di samping detail chain (tab Supply/Withdraw/Borrow/Repay), baris yang dibuka ditandai
- [x] Input jumlah dengan koma desimal, padanan USD, dan bunga per tahun
- [x] `nextStep` murni (pola swap-web) untuk cabang: belum connect, data belum siap, tx berjalan, jumlah kosong, saldo kurang, approve exact, tx utama
- [x] Approve default exact; unlimited hanya pilihan eksplisit user, dengan teks risiko + link revoke.cash (pola Q7 swap)
- [x] Daftar langkah wallet inline di atas tombol utama: judul, penjelasan, alamat kontrak, "✓ alamat resmi Aave" (dari address-book), tautan explorer (Q9)
- [x] Catatan "smart account activation / gas gratis" yang bisa ditutup dan nggak muncul lagi
- [x] Status tx per langkah: menunggu konfirmasi di wallet → menunggu jaringan → selesai + tautan explorer; ditolak di wallet → pesan + "Coba lagi"
- [x] Setelah sukses, posisi di-refetch dan tx masuk riwayat lokal
- [x] Error wallet dan kontrak diterjemahkan ke bahasa Indonesia (pola `walletError` swap-web)
- [x] Test: `nextStep` (Jest) dan supply USDC di fork (Jest fork, snapshot/revert)

## Comments

- 2026-10-27: Selesai di branch `feat/03-supply-erc20`.
  - `nextStep` (`src/core/nextStep.ts`, Jest), cabang:
    - Sesuai tiket: connect, loading/loadFailed, busy, enterAmount, saldo kurang, approve (exact/unlimited), supply.
    - Tambahan `locked`: pengaman fork tiket 01 belum aman.
    - Tambahan `resetApproval`: USDT Ethereum menolak approve dari izin ≠ 0 ke nilai ≠ 0. Flag `requiresApprovalReset` ada di whitelist.
    - Ganti network ada di tiket 10, ETH kurang untuk gas di tiket 09.
  - Izin ke Pool (`allowance`) dibaca di multicall yang sama dengan saldo. Fixture tiket 02 ditulis ulang dan cuma bertambah field `allowances`.
  - Satu klik menjalankan semua langkah (reset → approve → supply). Sesudah tiap langkah posisi dibaca ulang dan `nextStep` dihitung lagi. Baca ulang yang gagal dianggap error (data lama nggak dipakai), jadi nggak pernah minta approve dua kali.
  - **Gas limit = `estimateGas` + 20%** (`core/gasMargin.ts`, port swap-web).
    - Ketemu di test fork: supply USDC kedua dengan limit = estimasi polos (162.941) revert out of gas di `mint` aToken USDC; replay dengan gas lebih besar sukses.
    - Estimasi di depan juga menangkap revert kontrak sebelum popup wallet. Custom error Aave di-decode (`aaveErrorName`) dan diterjemahkan.
  - Riwayat lokal (`core/localHistory.ts`) cuma mencatat supply, dengan timestamp blok (Q30). Approve/reset nggak dicatat karena bukan jenis riwayat dan nggak punya pasangan di indexer. Tampilan Riwayat ada di tiket 22.
  - Tiap langkah wallet menampilkan alamat resmi beserta explorer. Approve menampilkan dua alamat: kontrak token (tujuan tx di wallet) dan Aave Pool (yang diberi izin). Tx fork cuma tampil hash pendek, karena tautan explorer publiknya pasti 404.
  - Test fork (`pnpm test:fork`, Anvil khusus suite di port 18555, snapshot/revert per test):
    - supply 1.000 USDC exact: izin sisa 0, jadi jaminan
    - unlimited: approve sekali, supply berikutnya tanpa approve
    - reset izin USDT
    - decode `InvalidAmount`
  - Verifikasi browser (Playwright, fork dev): supply 1.000,5 / 500 / 250 / 100 USDC ujung ke ujung, posisi langsung ter-update. Jalur "ditolak di wallet" belum bisa dicoba di browser karena connector fork belum bisa menolak (Dev Tools reject, tiket 17). Pesannya teruji lewat `walletErrorKind`.
  - **RPC fork = `eth.drpc.org`** (`.env.fork` salinan swap-web), bukan Alchemy. Satu run test fork dari Anvil dingin makan 8–24 menit (run penuh terakhir: 4/4 lulus, 24 menit).
  - Review dua sumbu, yang diperbaiki:
    - Error RPC waktu menunggu receipt nggak lagi membuat panel macet.
    - Data basi sesudah approve.
    - Mode izin kembali ke Exact sesudah sukses / ganti aset.
    - Urutan `busy` sebelum `locked`.
    - Hash per langkah.
    - "Coba lagi" benar-benar mengulang.
    - Baris baru ditandai sesudah diklik.
    - URL revoke.cash dipindah ke config.
    - Flag aset dibawa baris pasar, bukan dicari di `WHITELIST`.
  - Review, yang sengaja nggak diubah:
    - Aksen violet di status "konfirmasi di wallet…" mengikuti prototype yang disetujui.
    - Smell "nama langkah tersebar di beberapa switch" ditunda sampai tiket 04/05 menambah aksi, supaya bentuknya jelas dulu.
