# 23: Banner & rincian likuidasi

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User yang posisinya dilikuidasi melihat banner "Posisi Anda di <chain> dilikuidasi pada <waktu>" di bawah banner Bahaya, dan bisa membuka rincian: apa yang dijual, berapa penaltinya, dan HF waktu itu.

**Blocked by:** 21 (Indexer: likuidasi), 22 (Halaman riwayat + status jaringan), 11 (Dashboard: hero + segmen chain + banner Bahaya)

**Status:** resolved

- [x] Banner untuk likuidasi 30 hari terakhir (dihitung dari timestamp blok, Q30) yang belum ditutup; ✕ menyimpan txHash + logIndex di localStorage (Q17)
- [x] Beberapa likuidasi digabung jadi satu banner + "Lihat riwayat"; posisinya di bawah banner Bahaya
- [x] Rincian: jaminan dijual (token + USD), utang dilunasi, penalti (token + USD + persen), HF sebelum likuidasi (atau "tidak tersedia"), "sisa utang <x> dihapus" kalau ada `DeficitCreated`, tautan explorer
- [x] Diverifikasi ujung ke ujung di fork memakai alat likuidasi Dev Tools (tiket 18)

## Comments

- ~~Dikoreksi 2026-10-28, lihat koreksi close factor di bawah.~~ 2026-10-28 (dari tiket 18): aturan v3.7 (`LiquidationLogic`, dibuktikan di fork tiket 18): close factor 50% hanya kalau HF ≥ 0,95; di bawahnya 100%. Selain itu, kalau sisa utang **atau** sisa jaminan sesudah likuidasi 50% kurang dari $1.000 (`MIN_LEFTOVER_BASE`), likuidasi boleh penuh. Kalau jaminan habis sementara utang masih tersisa, sisanya dihapus (`DeficitCreated`). Di dev fork, posisi kecil (utang ±$1.400) selalu terlikuidasi habis. Teks banner dan rincian jangan mengasumsikan "maksimal 50%" atau "separuh posisi": tampilkan jumlah yang benar-benar dilunasi dan disita dari data indexer. Siapkan kalimat untuk posisi yang habis seluruhnya (utang 0 sesudahnya, mungkin plus "sisa utang <x> dihapus"). Verifikasi ujung ke ujung sebaiknya mencoba dua kasus: sebagian (posisi besar) dan habis + deficit (posisi kecil).
- 2026-10-28 (**koreksi close factor**, dibaca dari `LiquidationLogic.executeLiquidationCall` tag `v3.7.0` aave-v3-origin = Pool revision 11 di blok pin, lalu dibuktikan di fork):
  - Default: utang **di reserve utang yang dipilih** boleh dilunasi 100%.
  - Dibatasi hanya kalau **ketiga** syarat terpenuhi: jaminan di reserve jaminan yang dipilih ≥ $2.000, utang di reserve utang yang dipilih ≥ $2.000 (`MIN_BASE_MAX_CLOSE_FACTOR_THRESHOLD`), dan HF **> 0,95** (HF tepat 0,95 sudah 100%). Batasnya = 50% dari **total** utang semua reserve (USD), dikonversi ke aset utang; kalau utang reserve itu ≤ angka itu, reserve itu tetap bisa lunas 100%.
  - Aturan sisa: kalau likuidasi nggak melunasi seluruh utang reserve itu **dan** nggak menghabiskan jaminan reserve itu, sisa utang dan sisa jaminan (di reserve itu) harus ≥ $1.000 (`MIN_LEFTOVER_BASE`); kalau nggak, tx **revert** `MustNotLeaveDust`. Ini nggak membuat likuidasi "otomatis penuh" (catatan lama keliru).
  - Kalau jaminan nggak cukup untuk utang + bonus, utang yang dilunasi dikecilkan sampai jaminan habis, lalu sisa utang dihapus (`DeficitCreated`).
  - Posisi kecil dev fork (utang ±$1.400) selalu habis karena utangnya < $2.000, bukan karena `MIN_LEFTOVER_BASE`.
  - Bukti replay (fork Ethereum, ETH $1.800, USDC $0,9998, akun 0xf39F tanpa posisi asli di blok pin, `debtToCover` diminta = max, Anvil baru per kasus):

    | Kasus | HF sebelum (1e18) | Jaminan WETH / utang USDC | Likuidator, `receiveAToken` | `debtToCover` | Hasil |
    |---|---|---|---|---|---|
    | A | 996202717223961056 | 10 ($18.000) / 15.000 ($14.996,95) | 0x7099…, false | 7.500 USDC | 50% |
    | B | 996202717634064507 | 10 ($18.000) / 15.000 ($14.996,95) | alamat baru, true | 7.500 USDC | 50% |
    | C | 996202717257451294 | 20 ($36.000) / 30.000 ($29.993,95) | 0x7099…, false | 15.000 USDC | 50% |

    Ketiganya memenuhi semua syarat 50%. HF sesudah A/B/C = 1,1209.
  - **Pengamatan "sekali penuh, sekali 50%" (tiket 21) adalah kesalahan pengamatan, bukan perilaku kontrak.** Run "penuh" terkontaminasi: invocation pertama script gagal sesudah membuka posisi, lalu dijalankan ulang di Anvil yang sama, jadi posisinya 20 ETH / 30.000 USDC (= kasus C); burn 15.000 USDC dibaca keliru sebagai seluruh utang. Likuidator dan `receiveAToken` nggak berpengaruh.
  - Untuk teks tiket ini: banner/rincian tetap menampilkan jumlah dari indexer, tanpa "maksimal 50%" atau "separuh posisi". Verifikasi ujung ke ujung: kasus sebagian = posisi dengan jaminan & utang ≥ $2.000 dan HF di antara 0,95 dan 1 (mis. 10 ETH / 15.000 USDC di ETH $1.800); kasus habis + deficit = posisi kecil (utang < $2.000) di harga ETH rendah (mis. 1 ETH / 1.400 USDC di $1.100).
- 2026-10-28 (selesai): core `core/liquidation.ts` (`bannerLiquidations` = likuidasi ≤ 30 hari menurut blok terbaru chain-nya + belum ditutup, `dismissKey` = chain:txHash:logIndex, `liquidationOutcome`, `liquidationFacts`). UI: `app/LiquidationBanner.tsx` (banner + `useLiquidationBanner`, ✕ di localStorage `lending-web:dismissedLiquidations`), `app/LiquidationDetails.tsx` (rincian, dipakai banner & baris Riwayat), `app/useTokenLookup.ts` (dipindah dari HistoryView). Banner Bahaya + likuidasi satu tumpukan di atas hero. Banyak likuidasi → "dilikuidasi N kali dalam 30 hari terakhir, di <chain>" + "Lihat riwayat" ke `/riwayat?jenis=liquidation` (filter Likuidasi terpilih).
  - Kalimat hasil: sebagian → "Sebagian jaminan dijual untuk melunasi utang."; jaminan reserve itu habis (jaminan nonaktif di tx yang sama) → "Seluruh jaminan <token> dijual…"; ada `DeficitCreated` → "Seluruh jaminan dijual, dan sisa utang <x> dihapus." Nggak ada "separuh"/"50%".
  - Persen penalti = bonus − 100% dan ditulis "5% dari utang dilunasi" (token & USD = total − total/bonus, GLOSSARY). Rincian tetap tampil sebagian kalau bacaan chain belum ada (jumlah "—", HF + tautan tx tetap).
  - Di luar teks tiket, alasannya: (1) baris likuidasi di Riwayat juga bisa dibuka rinciannya, karena banner gabungan cuma mengarah ke Riwayat; (2) `useHistory` kini menarik indexer tiap 30 dtk (seirama bacaan chain), karena likuidasi oleh pihak lain nggak pernah jadi tx lokal; (3) likuidasi di chain yang blok terbarunya belum terbaca nggak masuk banner (umurnya nggak bisa dinilai, Q30).
  - ~~Belum ada: kalimat khusus "utang lunas"~~ → ditambahkan, lihat poin 2026-10-28 "utang lunas" di bawah.
  - Diverifikasi ujung ke ujung (build :3201 + Playwright, Anvil dev Ethereum di dalam `evm_snapshot`, posisi sementara 10 ETH / 15.000 USDC, likuidasi lewat Dev Tools):
    - ETH $1.800: dilunasi 7.500 USDC, jaminan dijual 4,3741 ETH ($7.873), penalti 0,2083 ETH ($375, 5%), HF sebelum ≈ 0,99, banner tunggal di bawah banner Bahaya.
    - ETH $500: seluruh sisa 5,6259 ETH dijual ($2.813), dilunasi 2.679,54 USDC, sisa utang 4.820,46 USDC dihapus, HF sebelum ≈ 0,31. Banner jadi gabungan "2 kali" → Lihat riwayat → dua baris dengan rincian.
    - ✕ → hilang, tetap hilang sesudah reload. Tanpa page error.
    - Sesudahnya `evm_revert` + `db:reset:fork` + `dev:fork` ulang: posisi kembali 1 ETH / 1.000 USDC (HF 1,915), indexer tanpa likuidasi.
    - Perubahan teks sesudah review (persen penalti, jumlah sisa utang di kalimat banner, fallback "—") cuma dicek lewat Jest + typecheck, nggak diulang di browser.
- 2026-10-28 (**utang lunas**, permintaan user): indexer menyimpan `debtRemaining` = saldo variable debt token user di reserve utang itu, dibaca di blok likuidasi seperti bonus/harga (lending-indexer 103be1a, test integrasi: 50% → sisa > 0, 1 ETH / 1.000 USDC di $1.100 → 0). `liquidationOutcome` punya cabang `debtRepaid` (sisa 0, jaminan reserve itu masih aktif, tanpa deficit) → "Utang USDC Anda lunas; sebagian jaminan ETH dijual, sisanya tetap milik Anda." Kalau jaminan reserve itu juga habis, kalimat jaminan habis yang menang. GLOSSARY: "Utang lunas (likuidasi)". Persen penalti tetap "dari utang dilunasi" (keputusan user).
  - Dicek di browser (posisi tes 1 ETH / 1.000 USDC, ETH $1.100 lewat Dev Tools, di dalam `evm_snapshot`): banner menulis kalimat utang lunas; rincian 0,9544 ETH ($1.050) dijual, 1.000 USDC dilunasi, penalti 0,0454 ETH ($49,99 · 5% dari utang dilunasi), HF sebelum ≈ 0,91; sisa jaminan $50,21 di segmen Ethereum. Lalu `evm_revert` + `db:reset:fork` + `dev:fork` ulang: posisi kembali 1 ETH / 1.000 USDC (HF 1,915), indexer tanpa likuidasi.
