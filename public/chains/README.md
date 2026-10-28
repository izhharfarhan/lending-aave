# Logo chain

Logo chain yang dipakai `ChainIcon` (tiket 27), menggantikan inisial E/B/A. Pemetaan chainId → file ada di
`src/config/chainLogos.ts`; chain yang nggak ada di sana (atau file yang gagal dimuat) tampil sebagai inisial di kotak
warna chain. File dipakai apa adanya (tanpa diedit); berlian Ethereum diberi alas terang oleh komponen, bukan di file.

Semua file diambil 2026-10-29 dari sumber resmi (situs atau brand kit pemilik merek), pola sama dengan
`public/tokens/README.md`. **Tidak ada yang berlisensi terbuka**: ini pemakaian merek dagang untuk menamai jaringan,
tunduk pada pedoman merek masing-masing. Sumber GitHub dipatok ke commit.

| File | Chain | Sumber | Lisensi / ketentuan (dikutip) |
|---|---|---|---|
| ethereum.svg | Ethereum | ethereum.org `public/images/assets/svgs/eth-diamond-purple.svg` (github.com/ethereum/ethereum-org-website), halaman ethereum.org/assets; salinan `public/tokens/eth.svg` | Repo: MIT License, "Copyright (c) 2019-2026 ethereum.org contributors" |
| base.svg | Base | github.com/base/brand-kit `logo/TheSquare/Digital/Base_square_blue.svg` @eba9e730be34 ("Symbol" di README brand kit; pedoman di base.org/brand) | Tanpa LICENSE; README merujuk ke Brand Guide (`guides/brand-guide.pdf`) |
| arbitrum.svg | Arbitrum One | Arbitrum Foundation Brand Kit (arbitrumfoundation.notion.site), Logomark RGB; salinan `public/tokens/arb.svg` | "…these guidelines are designed to ensure its consistent and appropriate use." |

Menambah chain: taruh logo dari brand kit resminya di sini, tambah barisnya di tabel, lalu petakan chainId-nya di
`src/config/chainLogos.ts` (test `chainLogos.spec.ts` memastikan tiap chain yang didukung punya file yang ada).
