# 09: Biaya jaringan + ETH kurang untuk gas

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User melihat perkiraan biaya jaringan sebelum klik, dan kalau ETH-nya kurang, tombol utama sudah berubah jadi "ETH kurang untuk biaya jaringan" beserta perkiraan ETH yang dibutuhkan dan tautan "Cara mendapatkan ETH".

**Blocked by:** 03 (Supply ERC20 (tracer transaksi))

**Status:** resolved

- [x] Biaya di panel dari `estimateGas` atas calldata asli, termasuk approve/izin yang masih tersisa (pola Q12 swap)
- [x] Saldo ETH < biaya → tombol utama nonaktif "ETH kurang untuk biaya jaringan" + perkiraan ETH yang dibutuhkan, sebelum user klik
- [x] Halaman bantuan "Cara mendapatkan ETH" (exchange / bridge resmi; mode fork → faucet Dev Tools)
- [x] Perkiraan kasar per chain untuk badge kartu (gasPrice × gas tipikal aksi Aave, dikalibrasi dari `gasUsed` di fork) tersedia untuk dipakai dashboard
- [x] Test `nextStep` cabang ETH kurang

## Comments

- Implementasi:
  - `nextStep` mendapat `ethBalance` + `networkFee`; langkah `needsEthForGas { needed }` di prioritas 5 (sesudah Dijeda / pengaman fork, sebelum "Supply jaminan dulu" dan "Masukkan jumlah"). ETH 0 selalu terkunci (perkiraan ditampilkan kalau sudah ada); biaya `null` dengan ETH > 0 = cek dilewati (pola Q19 swap). Supply/repay ETH: jumlah yang dikirim + biaya harus muat di saldo ETH, dicek sesudah "Saldo tidak cukup".
  - `evaluatePanel` membaca saldo ETH dari baris native whitelist dan mengembalikan `stepBeforeGasCheck` (langkah kalau ETH dianggap cukup), supaya biaya tetap bisa dihitung saat tombol terkunci.
  - `core/networkFee.ts`: total = gas × (baseFee + priority) + L1 fee per tx (OP Stack/Base, `isOpStack`). Langkah pertama diestimasi `eth_estimateGas` atas calldata asli (`aave/fetchNetworkFee.ts`); langkah sesudahnya (transaksi utama sesudah izin, yang masih revert sebelum izinnya ada) pakai `STEP_GAS`, batas atas `gasUsed` terukur di fork (approve ≤ 55.570, delegate 53.714, supply ≤ 201.989, borrow ≤ 290.692, withdraw ETH dengan utang 316.941, repay ≤ 167.277, setCollateral ≤ 157.268). Fork test menjaga STEP_GAS ≥ gasUsed dan ≤ 130% dari yang terbesar.
  - Badge kartu chain: `fetchTypicalActionFee(client)` = gasPrice × `TYPICAL_ACTION_GAS` (300.000, menutup approve + supply ERC20 dan borrow); belum ditampilkan, dipakai dashboard (tiket 11). Tanpa L1 fee Base.
  - Panel: baris "Biaya jaringan ~X ETH" (diperbarui ±30 detik), tombol "ETH kurang untuk biaya jaringan" + perkiraan ETH yang dibutuhkan + tautan ke `/cara-mendapatkan-eth` (exchange, bridge resmi, catatan mode fork).
- Catatan untuk tiket lain:
  - Tiket 17: halaman bantuan menyebut "faucet di Dev Tools"; tautkan ke faucetnya begitu Dev Tools ada.
  - Tiket 10: L1 fee Base baru diuji di unit test (`networkFee`); tambahkan fork test Base.
  - Di tengah rangkaian langkah (sesudah approve) biaya nggak dihitung ulang; cuma ETH 0 yang menghentikan rangkaian.
