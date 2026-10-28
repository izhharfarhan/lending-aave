# 21: Indexer: likuidasi

**Repo:** lending-indexer

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Likuidasi yang dikirim pihak lain tercatat lengkap: jaminan yang hilang, utang yang dilunasi, penalti, protocol fee, sisa utang yang dihapus, dan HF sebelum likuidasi.

**Blocked by:** 20 (Indexer: semua event, 3 chain)

**Status:** resolved

- [x] Event `LiquidationCall` (pemilik = `user`), `DeficitCreated`, dan `Transfer` aToken borrower → treasury di tx yang sama (protocol fee, disimpan apa adanya)
- [x] Jaminan hilang = `liquidatedCollateralAmount` + protocol fee; bonus = kategori E-Mode kalau user di E-Mode dan aset jaminan di `collateralBitmap`, selain itu bonus reserve; penalti = total − total/bonus (V5)
- [x] `debtToCover` disimpan sebagai utang yang benar-benar dilunasi
- [x] HF sebelum likuidasi dari `getUserAccountData` di blok −1; kalau gagal disimpan "tidak tersedia" tanpa menggagalkan baris (Q16)
- [x] Event jaminan otomatis karena likuidasi digabung ke baris likuidasi
- [x] Test Vitest dengan fixture likuidasi dari fork (pakai alat likuidasi Dev Tools/skrip yang sama)

## Comments

- ~~Dikoreksi 2026-10-28, lihat koreksi close factor di bawah.~~ 2026-10-28 (dari tiket 18): aturan v3.7 (`LiquidationLogic`, dibuktikan di fork tiket 18): close factor 50% hanya kalau HF ≥ 0,95; di bawahnya 100%. Selain itu, kalau sisa utang **atau** sisa jaminan sesudah likuidasi 50% kurang dari $1.000 (`MIN_LEFTOVER_BASE`), likuidasi boleh penuh. Kalau jaminan habis sementara utang masih tersisa, sisanya dihapus (`DeficitCreated`). Di dev fork, posisi kecil (utang ±$1.400) selalu terlikuidasi habis. Akibatnya untuk indexer: jumlah yang dilunasi dan jaminan yang disita diambil dari event (`debtToCover`, `liquidatedCollateralAmount`, Transfer ke treasury), jangan pernah dihitung atau dibatasi dengan asumsi "maksimal 50%". Satu tx bisa menghabiskan posisi dan sekaligus memuat `DeficitCreated`. Fixture: likuidasi sebagian butuh posisi besar (test tiket 18 memakai 10 ETH / 15.000 USDC di harga ETH $1.800); likuidasi penuh + deficit cukup posisi kecil di harga ETH rendah (mis. $1.100).
- 2026-10-28 (selesai, lending-indexer 533ffca + 8796719): baris `position_event` jenis `liquidation` (`owner` = user, `caller` = likuidator, `amount` = jaminan hilang = bagian likuidator + fee) + tabel `liquidation` (relasi GraphQL `positionEvent.liquidation`, index `(owner, timestamp)` untuk banner Q17). Aturan murni di `src/core/liquidation.ts`.
  - **Menyimpang dari teks spec ("mendengarkan Transfer aToken ke treasury" dan `DeficitCreated`)**: fee dan deficit diambil dari **receipt** tx likuidasi (satu RPC per likuidasi). Alasannya: Ethereum punya 67 reserve on-chain vs 63 di address-book, jadi mendengarkan per aToken bisa melewatkan fee. Sumber datanya tetap event yang sama.
  - Urutan log v3.7 (dicek di fork): `ReserveUsedAsCollateralDisabled` → burn utang → `DeficitCreated` → burn jaminan → `Transfer` aToken 0x0→treasury (akrual, bukan fee) → `Transfer` user→treasury (fee) → `LiquidationCall` paling akhir. Treasury semua aToken = `COLLECTOR` di 3 chain. `receiveAToken = true` nggak memancarkan `ReserveUsedAsCollateralEnabled` untuk likuidator.
  - HF blok −1: kalau RPC nggak punya state-nya, lapisan RPC Ponder me-retry 10× (±1 menit, indexing chain itu tertahan) sebelum handler menyimpan "tidak tersedia". Dibiarkan: tanpa retry, error sementara tersimpan permanen. Diuji dengan Anvil test Base `--prune-history 0`.
  - Kompromi (README indexer): bonus/E-Mode/harga dibaca di akhir blok likuidasi; cuma HF yang punya fallback; transfer manual aToken ke treasury dalam tx batch ikut terhitung fee.
  - Untuk tiket 22/23: jumlah bigint mentah, penalti USD = `penalty` × `collateralPrice` (8 desimal) dengan desimal token jaminan dari data reserve frontend; deficit = `deficitAssets`/`deficitAmounts` berpasangan.
  - ~~Pengamatan belum terjelaskan: posisi 10 ETH / 15.000 USDC di HF 0,996 sekali terlikuidasi penuh dan sekali 50%.~~ Terjelaskan: kesalahan pengamatan, lihat koreksi close factor di bawah.
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
