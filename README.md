# lending-aave

Proyek belajar: dashboard lending di atas Aave v3.7 untuk Ethereum, Base, dan Arbitrum, plus indexer riwayatnya.

| Folder | Isi |
|---|---|
| [`lending-web/`](lending-web/) | App Next.js: posisi semua chain, health factor, simulasi aksi, riwayat, pemberitahuan likuidasi. Spec, tiket, dan keputusan ada di `lending-web/.scratch/` dan `lending-web/DECISIONS.md`. |
| [`lending-indexer/`](lending-indexer/) | Ponder indexer: event posisi Aave (supply, withdraw, borrow, repay, jaminan, likuidasi) di tiga chain, disajikan lewat GraphQL ke lending-web. |

Cara menjalankan ada di README masing-masing folder. Nggak ada key atau file `.env` di repo ini; isi sendiri dari
`.env.example`.
