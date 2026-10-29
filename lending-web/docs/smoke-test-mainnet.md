# Smoke test mainnet (tiket 25)

Transaksi asli, dana asli, nominal kecil. **Dijalankan dan ditandatangani pemilik wallet sendiri**; agent nggak
mengirim transaksi mainnet dan nggak memegang private key. Satu putaran per chain: supply ETH → borrow USDC → lunasi
USDC → withdraw semua ETH, jadi dana kembali di akhir (minus biaya jaringan).

## Sebelum mulai

1. `pnpm check:mainnet`: ketiga chain `POOL_REVISION 11 ✓`, dan catat perkiraan biaya smoke test per chain. Kalau
   bukan 11, **berhenti**: aturan E-Mode/event harus dicek ulang dulu.
2. `.env.mainnet` terisi (`NEXT_PUBLIC_APP_MODE=mainnet`, `NEXT_PUBLIC_RPC_URL_*`), lalu `pnpm dev:mainnet`. Kalau
   `.env.mainnet` diubah, restart server-nya.
3. (Opsional, untuk riwayat + ukur kuota indexer) indexer mainnet jalan, `NEXT_PUBLIC_INDEXER_URL` di `.env.mainnet`
   terisi. Catat angka pemakaian di dashboard provider RPC indexer sebelum mulai.
4. Saldo wallet per chain (EOA biasa, bukan smart wallet):

   | Chain | ETH | USDC tambahan | Kenapa |
   |---|---|---|---|
   | Ethereum | ≥ 0,01 | ≥ 0,05 USDC | 0,005 supply + gas (≤ 1,2 juta gas; di 2 gwei ±0,0024 ETH) + cadangan gas app 0,0005 |
   | Base | ≥ 0,006 | ≥ 0,05 USDC (native, bukan USDbC) | 0,005 supply + gas & L1 fee (sen) |
   | Arbitrum | ≥ 0,006 | ≥ 0,05 USDC (native, bukan USDC.e) | 0,005 supply + gas (sen) |

   USDC tambahan dibutuhkan karena utang bertambah bunga tiap detik: 2 USDC hasil borrow selalu sedikit kurang untuk
   melunasi penuh. Aave v3 nggak punya jumlah minimum supply/borrow; nominal di bawah dipilih supaya HF jauh dari 1.

Urutan chain yang disarankan: **Base → Arbitrum → Ethereum** (termurah dulu; kalau ada yang salah, ketahuan di chain
murah).

## Per chain

Pilih chain lewat segmen chain di dashboard (`?chain=base` / `arbitrum` / `ethereum`).

| # | Aksi di panel | Yang dicek di layar sebelum tanda tangan | Yang dicek sesudahnya |
|---|---|---|---|
| 0 | Connect wallet | Tanpa banner FORK MODE, tanpa Dev Tools, daftar wallet tanpa "Anvil (fork lokal)"; footer: nomor blok tiap chain bertambah | Alamat wallet di kanan atas |
| 1 | Supply **0,005 ETH** | Langkah: (Ganti ke <chain> kalau wallet di network lain) → "Supply 0,005 ETH" lewat gateway, **tanpa approve**; tujuan di popup wallet = Aave WrappedTokenGateway (cocokkan lewat tautan explorer ✓ resmi); "Biaya jaringan ~x ETH" masuk akal | Pesan sukses; "Supply Anda" ±0,005 ETH dengan jaminan aktif; HF "Tidak ada utang" |
| 2 | Borrow **2 USDC** | HF sebelum → sesudah (±4–5, Aman, tanpa centang risiko); "Dilikuidasi kalau ETH turun ke $x"; sisa batas pinjam; tujuan popup = Aave Pool | Wallet +2 USDC; "Utang Anda" 2 USDC; HF di hero & segmen chain sama dengan simulasi |
| 3 | Repay → **MAX** ("Lunasi utang USDC") | Dua langkah: approve **exact** (utang + bunga 1 hari, bukan unlimited) lalu repay; jumlah izin di popup wallet sama dengan yang ditulis panel | "Utang Anda" kosong, HF "Tidak ada utang"; izin USDC habis terpakai (opsional: cek di revoke.cash) |
| 4 | Withdraw → **MAX** ("Withdraw semua ETH") | Dua langkah: approve aWETH **exact** ke gateway lalu withdraw; tanpa utang, nggak ada peringatan jaminan | "Supply Anda" kosong; ETH kembali ke wallet (0,005 minus biaya); riwayat berisi 4 aksi |

**Khusus Base (L1 fee):** untuk tiap tx, bandingkan "Biaya jaringan" di panel (sudah termasuk L1 fee) dengan Basescan
→ halaman tx → "Transaction Fee" (total) dan "L1 Fees Paid". Selisih kecil wajar (gas dan harga L1 bergerak); yang
dicari: L1 fee nggak hilang dari perkiraan, dan total nggak meleset jauh (mis. 10×). Saat dicek 2026-10-28 L1 fee Base
sangat kecil (< $0,0001 per tx), jadi bagian ini bisa terlihat hampir nol.

**Catat per chain:** hash tiap tx, biaya sebenarnya vs "Biaya jaringan" di panel, dan apa pun yang tampil aneh.

## Mengembalikan dana

Langkah 3 dan 4 di atas sudah mengembalikan dana. Kalau putaran berhenti di tengah:

- **Masih ada utang**: Repay → MAX (lunasi). Kalau USDC di wallet kurang, tambah sedikit USDC dulu; "Lunasi" butuh
  utang + bunga.
- **Masih ada supply**: Withdraw → MAX sesudah utang lunas. Selama masih ada utang, withdraw semua dikunci ("Jaminan
  ini masih dibutuhkan"), itu memang benar.
- **App bermasalah**: posisi yang sama bisa dilunasi/ditarik di app.aave.com (market Ethereum / Base / Arbitrum), karena
  kontraknya sama.
- Sisa izin: semua izin exact dan habis terpakai; kalau ada yang tersisa (mis. putaran berhenti sesudah approve),
  cabut lewat revoke.cash.
