# Spec: Lending Aave V3 multi-chain (redesign)

Status: ready-for-agent
Repo: lending-web + lending-indexer
Sumber keputusan: `DECISIONS.md` (keputusan scope #1–#12, Q1–Q30, verifikasi V1–V8), `GLOSSARY.md`, ADR 0001. Kalau spec ini bertentangan dengan DECISIONS.md, DECISIONS.md yang menang dan spec ini harus diperbaiki.
Acuan visual: prototype di branch `prototype/dashboard` (disetujui Mas Yan). Kode prototype buangan; yang dipakai keputusannya, bukan kodenya.

## Problem Statement

Gua mau ngerti dari dalam gimana lending pool-based beneran bekerja: supply, jaminan, health factor, pinjaman, bunga, dan likuidasi, di atas kontrak Aave V3 yang sudah ada (arahan Mas Yan: "cari yang termudah", bukan bikin kontrak sendiri).

Waktu praktik sendiri di app.aave.com, gua kena beberapa jebakan yang bikin takut atau rugi:
- Punya token tapi ETH 0, dan transaksi baru gagal **setelah** diklik.
- Wallet menandai kontrak Aave sebagai "Malicious", dan app nggak membantu gua memastikan alamatnya resmi.
- Approve default unlimited.
- Wallet menawarkan "smart account activation" atau gas sponsor tanpa penjelasan.
- Dashboard Aave cuma menampilkan **satu market/chain**, jadi utang yang hampir dilikuidasi di chain lain nggak kelihatan.
- Istilah (APY, LTV, health factor) sulit buat user yang baru coba lending.

Mas Yan juga menilai desain app.aave.com masih jelek, jadi proyek ini sekaligus **redesign** dengan acuan PDF "Basic UI/UX for dApps" (web3jogja).

## Solution

App lending ala app.aave.com di Ethereum, Base, dan Arbitrum, di atas kontrak Aave V3 (v3.7, `POOL_REVISION` 11 di ketiga chain):
- **Dashboard semua chain** (ADR 0001): satu halaman menampilkan HF terendah, total supply/utang/net, dan batas pinjam terpakai tertinggi dari semua chain, plus banner Bahaya yang tetap muncul walaupun chain lain sedang dipilih. Di bawahnya segmen per chain, lalu detail chain terpilih berupa tabel datar dan panel aksi.
- **Aksi V1**: supply, withdraw, borrow, repay, dan toggle jaminan. Setiap aksi punya simulasi HF sebelum → sesudah, harga likuidasi, dan tingkat konfirmasi sesuai risiko. ETH dipakai langsung lewat WrappedTokenGateway.
- **Show the Risk + In Control**: cek gas sebelum klik, daftar langkah wallet beserta alamat resmi sebelum popup, approve exact, dan status transaksi multi-tahap.
- **Progressive disclosure**: tampilan awal simpel untuk user menengah, detail parameter bisa dibuka untuk user pro.
- **Riwayat** semua chain dari indexer (Ponder), termasuk likuidasi yang dikirim pihak lain.
- **Mode fork** (Anvil) dengan Dev Tools: maju waktu, ubah harga oracle, simulasi likuidasi. **Mode mainnet** (Alchemy). Jalan lokal saja.

Persona utama **user pro** (posisi di beberapa chain, mau cepat dan angka lengkap); persona kedua **user menengah** (sering swap, baru coba lending, takut salah).

## User Stories

### Dashboard & ringkasan semua chain

1. Sebagai user pro, gua mau satu halaman yang membaca posisi gua di Ethereum, Base, dan Arbitrum sekaligus, supaya utang di chain lain nggak tersembunyi.
2. Sebagai user pro, gua mau HF terendah dari semua chain tampil sebagai angka paling besar di halaman, supaya risiko terbesar langsung kelihatan.
3. Sebagai user pro, gua mau HF terendah cuma dihitung dari chain yang punya utang, supaya chain tanpa utang nggak mengaburkan angkanya.
4. Sebagai user, gua mau angka HF terendah berwarna aksen kalau Aman, amber kalau Waspada, dan merah kalau Bahaya, supaya warnanya nggak menutupi risiko.
5. Sebagai user pro, gua mau skala HF (1,0 likuidasi → 1,5 → 2,0 → 3,0+) dengan penanda tiap chain, supaya posisi semua chain kelihatan relatif terhadap batas likuidasi.
6. Sebagai user, gua mau bisa klik penanda chain di skala HF untuk memilih chain itu, supaya cepat pindah ke chain yang perlu ditangani.
7. Sebagai user, gua mau total supply, total utang, dan net (supply − utang) dalam USD harga oracle Aave, supaya tahu nilai posisi gua secara keseluruhan.
8. Sebagai user, gua mau saldo wallet nggak ikut dijumlah di ringkasan, supaya ringkasan cuma berisi posisi di Aave.
9. Sebagai user pro, gua mau bar "Batas pinjam terpakai · tertinggi: <chain> <x>% · sisa $y", supaya chain yang paling dekat batas pinjamnya nggak tertutupi total semua chain.
10. Sebagai user, gua mau warna bar batas pinjam ikut tingkat risiko HF chain yang ditampilkan, supaya warnanya konsisten dengan HF.
11. Sebagai user tanpa utang di chain mana pun, gua mau bar batas pinjam disembunyikan dan HF tertulis "Tidak ada utang", bukan "∞".
12. Sebagai user pro, gua mau banner Bahaya di atas ringkasan kalau ada chain dengan HF < 1,5, lengkap dengan HF dan harga likuidasinya, supaya gua nggak harus mencari sendiri.
13. Sebagai user pro dengan beberapa chain Bahaya, gua mau banner menyebut chain dengan HF terendah dulu lalu "+N chain lain", supaya banner tetap ringkas.
14. Sebagai user pro, gua mau tombol "Lihat <chain>" di banner yang memilih chain itu dan membuka panel penyelamatan dengan dua pilihan, Repay atau Supply jaminan, masing-masing dengan HF sesudah, supaya gua bisa membandingkan dulu sebelum memilih.
15. Sebagai user pro, gua mau memilih salah satu pilihan itu membuka tab aksinya dengan jumlah kosong, supaya gua tetap yang menentukan jumlahnya.
16. Sebagai user, gua mau banner Bahaya tetap muncul walaupun gua sedang memilih chain lain.
17. Sebagai user, gua mau chain Waspada cukup ditandai di segmen chain tanpa banner, supaya banner nggak dipakai untuk hal yang belum mendesak.

### Data yang gagal atau belum lengkap

18. Sebagai user, gua mau segmen chain yang gagal dibaca menulis "Gagal dimuat" dengan tombol "Coba lagi".
19. Sebagai user, gua mau ringkasan diberi label "Belum lengkap (2/3 chain)" kalau ada chain yang gagal, supaya gua nggak mengira angkanya final.
20. Sebagai user, gua mau HF terendah ditulis "≤ x" dengan keterangan "<chain> belum terbaca, bisa lebih rendah" kalau ada chain gagal dibaca.
21. Sebagai user, gua mau bar batas pinjam memberi keterangan "<chain> belum terbaca, bisa saja lebih tinggi" kalau ada chain gagal dibaca.
22. Sebagai user, gua mau data posisi diperbarui otomatis sekitar tiap 30 detik dan saat tab kembali difokuskan.
23. Sebagai user, gua mau skeleton saat data pertama kali dimuat, supaya tata letak nggak meloncat.

### Segmen chain & pemilihan chain

24. Sebagai user, gua mau tiap chain tampil sebagai segmen ringkas berisi HF (berwarna hanya kalau Waspada/Bahaya), supply, utang, dan garis pemakaian batas pinjam.
25. Sebagai user, gua mau segmen chain Bahaya ikut menampilkan harga likuidasinya.
26. Sebagai user, gua mau klik segmen chain cuma memilih chain di app (tercatat di URL), tanpa memunculkan popup ganti network di wallet.
27. Sebagai user, gua mau segmen chain tanpa posisi menulis "Belum ada posisi · <saldo terbesar aset whitelist> di wallet bisa di-supply", atau "Belum ada posisi" kalau wallet kosong.
28. Sebagai user, gua mau badge "ETH kurang untuk bertransaksi" di segmen chain yang saldo ETH-nya di bawah perkiraan biaya satu aksi Aave.
29. Sebagai user, gua mau chain terpilih bisa dibagikan lewat URL, supaya link yang sama membuka chain yang sama.

### Sebelum wallet terhubung

30. Sebagai user baru, gua mau ajakan "Hubungkan wallet untuk melihat posisi Anda di Ethereum, Base, dan Arbitrum sekaligus" di ringkasan.
31. Sebagai user menengah yang belum connect, gua mau tetap bisa melihat daftar aset dan APY chain terpilih secara read-only, supaya bisa melihat-lihat dulu tanpa takut.
32. Sebagai user yang belum connect, gua mau tombol utama panel aksi menulis "Hubungkan wallet".

### Detail chain terpilih

33. Sebagai user, gua mau kepala detail chain menampilkan HF + tingkat risiko, harga likuidasi "saat ini", dan sisa batas pinjam.
34. Sebagai user, gua mau tabel "Supply Anda" berisi aset (logo + nama), APY, saldo, dan toggle jaminan.
35. Sebagai user, gua mau tabel "Utang Anda" berisi aset, APY pinjaman, dan jumlah utang.
36. Sebagai user, gua mau tabel "Pasar supply" berisi aset, APY, saldo wallet, dan apakah aset itu bisa jadi jaminan.
37. Sebagai user, gua mau "Pasar supply" menyembunyikan aset bersaldo 0 di wallet, dengan toggle "Tampilkan semua".
38. Sebagai user, gua mau tabel "Pasar pinjam" berisi aset, APY pinjaman, dan jumlah yang bisa gua pinjam.
39. Sebagai user, gua mau klik satu baris tabel untuk membuka panel aksi aset itu, tanpa deretan tombol di tiap baris.
40. Sebagai user, gua mau baris yang sedang dibuka di panel ditandai, supaya jelas aset mana yang sedang gua atur.
41. Sebagai user, gua mau logo token berupa inisial di lingkaran berwarna.
42. Sebagai user pro, gua mau "Detail parameter <chain>" yang bisa dibuka (LTV, liquidation threshold, liquidation penalty, utilization, reserve factor, supply/borrow cap, harga oracle, alamat reserve/aToken), supaya angka lengkap tersedia tanpa membebani tampilan awal.
43. Sebagai user pro, gua mau status buka/tutup Detail diingat, supaya cukup sekali dibuka.
44. Sebagai user menengah, gua mau istilah asli Aave tetap dipakai tapi didampingi penjelasan sederhana dan ⓘ (mis. "Health factor 1,82 · Aman ⓘ").

### Aset per chain, Dibekukan, Dijeda

45. Sebagai user, gua mau aset yang ditawarkan per chain sesuai whitelist berbasis alamat: Ethereum ETH/WETH, USDC, USDT · Base ETH/WETH, USDC · Arbitrum ETH/WETH, USDC native, USDT.
46. Sebagai user di Arbitrum, gua mau "USDC" yang ditawarkan adalah USDC native, bukan USDC.e yang sedang dibekukan.
47. Sebagai user, gua mau parameter (LTV, LT, APY, borrowingEnabled, dll.) dibaca dari kontrak, bukan ditulis tangan, supaya tetap benar walaupun beda per chain atau berubah.
48. Sebagai user, gua mau reserve yang Dibekukan, Dijeda, atau nonaktif nggak muncul di "Pasar supply" dan "Pasar pinjam".
49. Sebagai user yang punya posisi di reserve Dibekukan, gua mau posisi itu tetap tampil dan tetap dihitung di HF dan ringkasan, berlabel "Dibekukan", dengan withdraw dan repay tetap bisa.
50. Sebagai user yang punya posisi di reserve Dijeda, gua mau posisi itu tetap tampil dan dihitung, berlabel "Dijeda", dengan semua aksi nonaktif sementara dan alasannya dijelaskan.

### Aset luar & E-Mode dari app.aave.com

51. Sebagai user pro, gua mau HF, total, dan sisa batas pinjam selalu memperhitungkan semua aset di posisi gua, termasuk yang di luar whitelist.
52. Sebagai user pro, gua mau aset luar tampil sebagai baris read-only "aset luar · dikelola di app.aave.com ↗", tanpa aksi.
53. Sebagai user pro yang mengaktifkan E-Mode lewat app.aave.com, gua mau simulasi HF, sisa batas pinjam, dan harga likuidasi memakai LT/LTV E-Mode per aset sesuai aturan kontrak, supaya angkanya sama dengan yang dipakai Aave.
54. Sebagai user pro di E-Mode, gua mau "Pasar pinjam" hanya berisi aset yang boleh dipinjam di kategori gua.
55. Sebagai user pro di E-Mode, gua mau keterangan read-only dari isi kategori, mis. "E-Mode aktif · jaminan: ETH, wstETH · pinjaman: ETH · diatur di app.aave.com ↗".
56. Sebagai user pro, gua mau label kategori E-Mode on-chain cuma tampil di Detail.
57. Sebagai user yang punya jaminan ber-LTV 0 (mis. USDC.e), gua mau pesan yang jelas kenapa withdraw jaminan lain ditolak dan apa yang harus dilakukan.

### Panel aksi

58. Sebagai user, gua mau panel aksi di samping detail chain (desktop) dengan tab Supply, Withdraw, Borrow, Repay, supaya ringkasan dan banner tetap kelihatan saat gua mengisi jumlah.
59. Sebagai user mobile, gua mau panel aksi sebagai bottom sheet layar penuh dengan tombol utama menempel di bawah.
60. Sebagai user mobile, gua mau bar Supply/Borrow menempel di bawah layar untuk membuka panel.
61. Sebagai user, gua mau mengisi jumlah dengan koma desimal dan memilih aset.
62. Sebagai user yang supply ETH, gua mau MAX menyisakan cadangan gas, supaya transaksinya nggak gagal karena ETH habis.
63. Sebagai user yang supply ERC20, gua mau MAX mengisi saldo wallet, dibatasi sisa kuota supply aset itu.
64. Sebagai user yang withdraw, gua mau MAX mengisi jumlah terbesar yang masih menjaga posisi di bawah batas LTV dan nggak melebihi likuiditas pool.
65. Sebagai user yang withdraw seluruh saldo tanpa utang yang bergantung padanya, gua mau nggak ada sisa debu bunga yang tertinggal.
66. Sebagai user yang borrow, gua mau MAX mengisi sampai batas LTV (dibatasi kuota pinjaman dan likuiditas pool), tapi tetap meminta konfirmasi risiko #9 kalau HF sesudahnya masuk tier centang atau ketik "confirm".
67. Sebagai user yang repay, gua mau MAX mengisi yang terkecil antara utang dan saldo wallet (repay ETH menyisakan gas), dan pelunasan penuh tanpa debu hanya dipakai kalau saldo gua cukup.
68. Sebagai user, gua mau melihat padanan USD dan bunga per tahun dari jumlah yang gua isi.
69. Sebagai user, gua mau melihat HF sebelum → sesudah, harga likuidasi sebelum → sesudah, dan biaya jaringan sebelum menekan tombol.
70. Sebagai user menengah yang mau borrow, gua mau melihat "Jaminan Anda di <chain>: …", supaya paham pinjaman gua dijamin apa.
71. Sebagai user menengah tanpa jaminan, gua mau tombol utama menulis "Supply jaminan dulu" dan membuka tab Supply.
72. Sebagai user, gua mau toggle jaminan di tabel membuka panel yang menjelaskan akibat mengaktifkan/mematikan jaminan, dengan HF sebelum → sesudah.
73. Sebagai user, gua mau tombol utama terkunci dengan teks "Jaminan ini masih dibutuhkan" kalau mematikan jaminan akan melewati batas.

### Peringatan risiko (#9)

74. Sebagai user, gua mau peringatan amber kalau HF sesudah borrow/withdraw/matikan jaminan ada di 1,5–2,0.
75. Sebagai user, gua mau wajib mencentang pernyataan risiko kalau HF sesudahnya 1,1–1,5.
76. Sebagai user, gua mau wajib mengetik "confirm" kalau HF sesudahnya < 1,1.
77. Sebagai user, gua mau tombol utama terkunci dengan teks "Melebihi batas pinjam" kalau aksi melewati batas LTV.
78. Sebagai user, gua mau tombol supply terkunci kalau supply cap akan terlampaui, dengan pesan "Kuota supply aset ini penuh" kalau kuotanya habis atau "Melebihi sisa kuota supply, tersisa X" kalau masih ada sisa, supaya gua nggak membayar gas untuk transaksi yang pasti ditolak.
79. Sebagai user, gua mau tombol borrow terkunci kalau borrow cap akan terlampaui, dengan pesan "Kuota pinjaman aset ini penuh" kalau kuotanya habis atau "Melebihi sisa kuota pinjaman, tersisa X" kalau masih ada sisa.
80. Sebagai user, gua mau tombol withdraw/borrow terkunci dengan pesan "Likuiditas pool tidak cukup, tersedia X" kalau jumlahnya melebihi isi pool.
81. Sebagai user, gua mau harga likuidasi ditulis "Dilikuidasi kalau ETH turun ke $x (−y%)" atau "…naik ke $x (+y%)" sesuai arah risikonya.
82. Sebagai user yang posisinya nggak bergantung pada harga ETH, gua mau tulisan "Tidak dipengaruhi harga ETH".
83. Sebagai user dengan campuran aset volatil lain, gua mau tulisan "Harga likuidasi tidak bisa dihitung untuk campuran aset ini, lihat Health factor", bukan angka yang menyesatkan.
84. Sebagai user yang HF-nya sudah < 1, gua mau tulisan merah "Sudah bisa dilikuidasi sekarang".

### Gas, langkah wallet, dan transaksi

85. Sebagai user dengan ETH 0, gua mau tombol utama berubah jadi "ETH kurang untuk biaya jaringan" (nonaktif) sebelum gua klik, beserta perkiraan ETH yang dibutuhkan.
86. Sebagai user dengan ETH 0, gua mau tautan "Cara mendapatkan ETH" yang menjelaskan beli di exchange atau bridge resmi, dan faucet Dev Tools di mode fork.
87. Sebagai user, gua mau biaya jaringan di panel dihitung dari `estimateGas` asli (plus L1 fee di Base), termasuk approve yang masih tersisa.
88. Sebagai user, gua mau melihat daftar "Yang akan diminta wallet" sebelum popup wallet muncul: ganti network, approve/izin, lalu transaksi utama.
89. Sebagai user yang wallet-nya menandai kontrak "Malicious", gua mau setiap langkah menampilkan alamat kontrak, tanda "alamat resmi Aave", dan tautan explorer, supaya bisa gua cocokkan sendiri.
90. Sebagai user, gua mau catatan singkat bahwa "smart account activation" atau gas gratis yang ditawarkan wallet bukan bagian app ini dan aman ditolak, yang bisa ditutup dan nggak muncul lagi.
91. Sebagai user yang wallet-nya di network lain, gua mau tombol utama menulis "Ganti ke <chain>" sebagai langkah pertama.
92. Sebagai user, gua mau approve default exact, dengan unlimited hanya kalau gua memilihnya sendiri.
93. Sebagai user yang supply/repay ETH, gua mau nggak ada langkah approve.
94. Sebagai user yang withdraw ETH, gua mau langkah "Approve aWETH ke WrappedTokenGateway" dijelaskan.
95. Sebagai user yang borrow ETH, gua mau langkah "Izinkan gateway berutang atas nama Anda" (credit delegation) dijelaskan.
96. Sebagai user yang repay penuh, gua mau utang lunas tanpa sisa debu bunga.
97. Sebagai user yang withdraw semua ETH, gua mau transaksinya nggak gagal karena saldo aWETH bertambah oleh bunga.
98. Sebagai user, gua mau status transaksi multi-tahap per langkah (menunggu konfirmasi di wallet → menunggu jaringan → selesai) dengan tautan explorer.
99. Sebagai user, gua mau posisi dan ringkasan langsung diperbarui setelah transaksi selesai.
100. Sebagai user yang menolak di wallet, gua mau pesan "Anda menolak permintaan di wallet. Tidak ada biaya terpakai." dan tombol "Coba lagi".
101. Sebagai user, gua mau error kontrak dan wallet diterjemahkan ke bahasa yang bisa dipahami.

### Likuidasi & riwayat

102. Sebagai user yang dilikuidasi, gua mau banner "Posisi Anda di <chain> dilikuidasi pada <waktu>" di atas ringkasan, di bawah banner Bahaya.
103. Sebagai user yang dilikuidasi, gua mau rincian: jaminan yang dijual (token + USD), utang yang dilunasi, penalti (token + USD + persen), dan HF sebelum likuidasi.
104. Sebagai user yang seluruh jaminannya habis, gua mau tulisan "sisa utang <x> dihapus".
105. Sebagai user, gua mau banner likuidasi bisa ditutup dan nggak muncul lagi untuk likuidasi yang sama di device ini, dan cuma untuk likuidasi 30 hari terakhir.
106. Sebagai user, gua mau waktu relatif ("30 hari terakhir", "x menit lalu") dihitung dari timestamp blok terbaru chain itu, supaya tetap benar di fork setelah "maju waktu" atau saat jam node tertinggal.
107. Sebagai user dengan beberapa likuidasi, gua mau satu banner gabungan dengan "Lihat riwayat".
108. Sebagai user, gua mau halaman Riwayat berisi semua chain dalam satu daftar, terbaru di atas, dengan filter chain dan jenis (Supply/Withdraw/Borrow/Repay/Likuidasi/Collateral).
109. Sebagai user, gua mau perubahan jaminan otomatis digabung ke baris transaksinya (mis. "Supply 1 ETH · jaminan aktif"), dan baris "Collateral" hanya untuk toggle manual.
110. Sebagai user, gua mau transaksi yang baru gua kirim langsung muncul di riwayat walaupun indexer belum menyusul.
111. Sebagai user, gua mau badge "Riwayat mungkin belum lengkap" kalau indexer tertinggal atau mati.
112. Sebagai user yang withdraw ETH lewat gateway, gua mau transaksinya tercatat sebagai milik gua di riwayat, bukan milik gateway.

### Navigasi & tampilan

113. Sebagai user desktop, gua mau sidebar kiri berisi wordmark, Dashboard, Riwayat, dan "E-Mode" redup dengan badge SEGERA.
114. Sebagai user, gua mau footer sidebar menampilkan blok terbaru per chain, status RPC, dan status indexer (sinkron / tertinggal N blok / offline).
115. Sebagai user, gua mau satu animasi masuk bertahap (hero → segmen chain → tabel) yang mati kalau gua memilih reduced motion.
116. Sebagai user mobile, gua mau semua fitur dashboard tetap bisa dipakai di layar 390px.

### Developer (mode fork, Dev Tools, testing)

117. Sebagai developer, gua mau mode fork (Anvil, 3 chain) dan mode mainnet (Alchemy) yang dipilih lewat env, seperti swap-web.
118. Sebagai developer, gua mau semua akun tes Anvil yang dipakai (termasuk likuidator) dibersihkan dari delegasi EIP-7702 saat fork dinyalakan.
119. Sebagai developer, gua mau Dev Tools di mode fork: semua fitur Dev Tools swap-web (reject tx/signature, latency, faucet) plus maju waktu (+1 hari / +30 hari / +1 tahun).
120. Sebagai developer, gua mau Dev Tools bisa mengubah harga ETH di oracle Aave, supaya bisa melihat HF dan banner Bahaya berubah.
121. Sebagai developer, gua mau Dev Tools bisa mensimulasikan likuidasi dari akun tes lain, supaya alur riwayat likuidasi bisa dicoba ujung ke ujung.
122. Sebagai developer, gua mau test paritas yang membuktikan HF, total jaminan, total utang, dan sisa batas pinjam hasil modul domain sama dengan `getUserAccountData` kontrak.

## Implementation Decisions

### Arsitektur & repo

- Dua repo di `~/projects/lending-aave/`: **lending-web** (Next.js + RainbowKit + wagmi/viem + TanStack Query + Tailwind v4, tanpa backend sendiri) dan **lending-indexer** (Ponder + Postgres Docker + Hono GraphQL), mengikuti pola swap-web/swap-indexer.
- Kontrak: Aave V3 yang sudah ada (v3.7). Tidak ada kontrak buatan sendiri, kecuali mock aggregator harga untuk Dev Tools di mode fork.
- Semua alamat kontrak dan aset dari `@bgd-labs/aave-address-book` per chain; mode fork memakai alamat mainnet. Whitelist aset per chain berbasis **alamat** (Ethereum WETH/USDC/USDT, Base WETH/USDC, Arbitrum WETH/USDCn/USDT). Menambah chain = menambah satu entri config.
- Data reserve dan posisi dibaca dari `UiPoolDataProviderV3` (`getReservesData`, `getUserReservesData` termasuk `userEmodeCategoryId`) dan `Pool` (`getUserAccountData`, id reserve, getter kategori E-Mode v3.7, lihat DECISIONS.md V4 "Keputusan tiket 14"), di blok yang sama per chain, tiga chain paralel.

### Modul domain murni (lending-web, seam utama)

Modul tanpa I/O yang menerima data per chain berbentuk data UiPoolDataProvider (reserve, posisi user per reserve, kategori E-Mode user, data kategori E-Mode, harga oracle) dan menghasilkan:

- **Tampilan posisi per chain**: daftar supply/utang (dengan label aset luar, Dibekukan, Dijeda), HF, tingkat risiko (Aman ≥ 2,0 · Waspada 1,5–2,0 · Bahaya < 1,5), total jaminan, total utang, sisa batas pinjam, batas pinjam terpakai, harga likuidasi.
- **Ringkasan semua chain**: HF terendah (dari chain berutang saja), total supply/utang/net, batas pinjam terpakai tertinggi per chain, daftar chain berbahaya, dan status belum lengkap. Chain yang gagal dibaca menghasilkan HF terendah "≤ x" dan batas pinjam "bisa saja lebih tinggi".
- **Simulasi aksi** (supply, withdraw, borrow, repay, toggle jaminan): posisi sesudah, HF sesudah, harga likuidasi sesudah, sisa batas pinjam sesudah, apakah melewati batas LTV, dan apakah melewati kapasitas pool.
- **MAX per aksi (Q26)**:
  - Supply: ERC20 = saldo wallet; ETH = saldo − cadangan gas (pola `maxSpendable` swap-web). Dibatasi sisa supply cap.
  - Withdraw: min(saldo supply, jumlah yang menjaga posisi di bawah batas LTV, likuiditas pool). Kalau hasilnya seluruh saldo dan tanpa utang yang bergantung padanya, tandai "withdraw semua" (dikirim sebagai `type(uint256).max`).
  - Borrow: sampai batas LTV, dibatasi sisa borrow cap dan likuiditas pool. Tingkat konfirmasi #9 tetap dihitung untuk jumlah hasil MAX; MAX tidak pernah melewati konfirmasi.
  - Borrow dan withdraw yang dibatasi batas LTV berhenti 0,1% di bawahnya: bunga dan harga oracle bergeser antara baca dan eksekusi (keputusan tiket 08).
  - Repay: min(utang, saldo wallet), ETH menyisakan cadangan gas. Tandai "lunas penuh" (`type(uint256).max`) hanya kalau saldo ≥ utang + bantalan bunga.
- **Kapasitas pool (Q27, aturan kontrak V8)**: supply cap `(scaledTotalSupply + amount + accruedToTreasury) × liquidityIndex ≤ supplyCap × 10^decimals`; borrow cap `(total utang variabel + amount) ≤ borrowCap × 10^decimals`; cap 0 = tanpa batas; likuiditas = `virtualUnderlyingBalance`. Hasilnya alasan penolakan yang bisa ditampilkan: melewati kuota supply, melewati kuota pinjaman, atau likuiditas tidak cukup, masing-masing dengan jumlah yang masih tersedia ("penuh" hanya kalau sisanya 0). Tombol mengunci jumlah yang ditolak kontrak **saat ini**; MAX memakai sisa kuota **10 menit ke depan** (bunga ikut menambah supply/utang pool), supaya MAX masih lolos sesudah approve (keputusan tiket 08).
- **Tingkat konfirmasi (#9)**: `none` (≥ 2,0) · `warn` (1,5–2,0) · `check` (1,1–1,5, wajib centang) · `type` (< 1,1, wajib ketik "confirm") · `locked` (melewati batas LTV). Berlaku untuk borrow, withdraw, dan mematikan jaminan. Untuk withdraw dan mematikan jaminan, aturan `locked` di batas LTV **lebih ketat dari kontrak** (kontrak hanya mensyaratkan HF ≥ 1); ini disengaja (V8).
- **Isolation mode level reserve tidak dimodelkan (Q28)**: fiturnya dihapus di v3.7. Field `debtCeiling`, `borrowableInIsolation`, `isolationModeTotalDebt`, dan `isSiloedBorrowing` dari UiPoolDataProvider diabaikan.
- **Filter daftar**: "Pasar supply" (sembunyikan saldo 0 kecuali "Tampilkan semua"), "Pasar pinjam" (`borrowingEnabled` di luar E-Mode, `borrowableBitmap` di dalam E-Mode), keduanya tanpa reserve frozen/paused/nonaktif. Posisi di reserve itu tetap ada di tampilan posisi dengan label Dibekukan (withdraw/repay masih bisa) atau Dijeda (semua aksi nonaktif).

Aturan nilai efektif per aset (v3.7, V4), untuk user di kategori E-Mode `k`:
- **LT**: aset di `collateralBitmap[k]` → LT kategori; aset lain → LT reserve.
- **LTV**: aset di `collateralBitmap[k]` → LTV kategori, atau 0 kalau di `ltvzeroBitmap[k]`; aset di luar bitmap → 0 kalau kategori `isolated`, selain itu LTV reserve.
- Tanpa E-Mode: LT/LTV reserve.

Harga likuidasi (Q14): satu-satunya aset volatil di whitelist adalah ETH (= WETH), jadi HF ditulis sebagai fungsi harga ETH dan dicari P saat HF(P) = 1. Inti logikanya dari prototype (disederhanakan):

```ts
// HF(P) = (a·P + b) / (c·P + d), a/b = jaminan ETH/stable × LT efektif, c/d = utang ETH/stable
type LiqPrice =
  | { kind: 'price'; price: number; dir: 'turun' | 'naik'; pct: number }
  | { kind: 'now' }      // HF sudah < 1
  | { kind: 'none' }     // a = c atau P ≤ 0: tidak dipengaruhi harga ETH
  | { kind: 'mixed' }    // ada aset volatil selain ETH (mis. aset luar): disembunyikan
  | { kind: 'noDebt' };
// price = (d − b) / (a − c); dir = a > c ? 'turun' : 'naik'
```

Stablecoin dianggap tetap di harga oracle saat ini; harga dihitung per chain dengan oracle chain itu dan diberi label "saat ini".

Sumber angka yang ditampilkan: HF, total jaminan, total utang, dan sisa batas pinjam **saat ini** diambil dari `getUserAccountData` (sumber kebenaran, termasuk aset luar). Modul domain menghitung nilai yang sama dari data per reserve untuk simulasi; test paritas (seam 3) membuktikan keduanya sama.

### `nextStep` (lending-web)

Fungsi murni yang menentukan isi tombol utama dan langkah wallet berikutnya, mengikuti pola `nextStep` swap-web. Urutan prioritas (dari prototype):

1. Belum connect → "Hubungkan wallet".
2. Data chain belum siap → "Memuat posisi…" / "Posisi gagal dimuat".
3. Transaksi berjalan → "Sedang diproses…".
4. Reserve Dijeda → semua aksi nonaktif; reserve Dibekukan → supply/borrow nonaktif.
5. ETH di chain itu < biaya jaringan → "ETH kurang untuk biaya jaringan" (nonaktif).
6. Borrow tanpa jaminan → "Supply jaminan dulu".
7. Jumlah kosong → "Masukkan jumlah".
8. Melewati batas LTV → "Melebihi batas pinjam" / "Jaminan ini masih dibutuhkan" (nonaktif).
9. Melewati kapasitas pool (Q27) → "Kuota supply aset ini penuh" / "Kuota pinjaman aset ini penuh" (sisa kuota 0), "Melebihi sisa kuota supply, tersisa X" / "Melebihi sisa kuota pinjaman, tersisa X" (masih ada sisa), atau "Likuiditas pool tidak cukup, tersedia X" (nonaktif).
10. Saldo kurang → "Saldo <aset> tidak cukup".
11. Konfirmasi risiko belum dipenuhi → "Centang pernyataan risiko dulu" / "Ketik "confirm" dulu".
12. Wallet di network lain → "Ganti ke <chain>" (`switchChain`, bisa ditolak).
13. Izin kurang → approve exact ERC20 ke Pool (supply/repay ERC20), approve aWETH ke gateway (withdraw ETH), atau credit delegation ke gateway (borrow ETH).
14. Transaksi utama.

Kebijakan izin:
- Default exact; unlimited hanya pilihan eksplisit user (pola Q7 swap).
- Repay penuh memakai `type(uint256).max`; izinnya diberi bantalan karena bunga berjalan.
- Withdraw semua ETH lewat gateway: izin aWETH diberi bantalan, karena saldo aWETH bertambah oleh bunga antara approve dan withdraw. `withdrawETHWithPermit` tidak dipakai.
- Repay ETH mengirim ETH berbantalan; kelebihannya di-refund otomatis oleh gateway.

**Panel penyelamatan (Q29)**: "Lihat <chain>" di banner Bahaya memilih chain itu dan membuka panel dengan dua pilihan, Repay dan Supply jaminan. Masing-masing menampilkan HF sesudah, dihitung modul domain dari MAX repay (Q26) dan dari saldo wallet aset jaminan yang tersedia. Memilih salah satu membuka tab aksinya dengan jumlah kosong.

Setiap langkah wallet membawa judul, penjelasan, alamat kontrak tujuan (dari address-book), dan tanda alamat resmi. Penolakan di wallet adalah hasil yang ditangani di setiap langkah, termasuk `switchChain`.

### Status transaksi

Bentuk state dari prototype (disederhanakan):

```ts
type Tx =
  | { status: 'idle' }
  | { status: 'running'; steps: WalletStep[]; step: number; phase: 'wallet' | 'confirming' }
  | { status: 'success'; steps: WalletStep[]; txHash: Hash }
  | { status: 'rejected'; steps: WalletStep[]; step: number };
```

Setelah `success`, data posisi chain itu di-refetch dan transaksi ditambahkan ke riwayat lokal.

### Adapter Aave (lending-web)

Satu adapter per chain yang membungkus semua I/O ke kontrak:
- Baca reserve (termasuk cap, `accruedToTreasury`, `virtualUnderlyingBalance`), posisi user, kategori E-Mode, harga oracle, `getUserAccountData`, saldo wallet, saldo ETH, dan **timestamp blok terbaru** chain itu (dipakai semua waktu relatif, Q30).
- Estimasi biaya: `estimateGas` atas calldata asli plus L1 fee di Base (pola Q12 swap). Kartu chain memakai perkiraan kasar gasPrice × gas tipikal aksi Aave yang dikalibrasi dari `gasUsed` di fork.
- Kirim transaksi: `Pool.supply/withdraw/borrow/repay/setUserUseReserveAsCollateral` untuk ERC20; `WrappedTokenGateway.depositETH/withdrawETH/borrowETH/repayETH` untuk ETH; approve/`approveDelegation`.
- Terjemahan error kontrak dan wallet ke pesan Indonesia (pola `walletError` swap-web), termasuk kode error Aave seperti aturan ltv0.

### Tampilan (lending-web)

Mengikuti prototype di branch `prototype/dashboard` dan Q20:
- Sidebar kiri, hero (HF terendah raksasa + skala HF + statistik bersekat + bar batas pinjam), banner yang menempel di atas hero, segmen chain, tabel datar, panel aksi di kanan.
- Latar hampir hitam netral; satu aksen violet `#a78bfa` untuk aksi, pilihan aktif, dan angka hero (kalau Aman). HF Aman netral, Waspada amber, Bahaya merah. Semua warna lewat CSS variable.
- Font: Unbounded (display), IBM Plex Sans (teks), IBM Plex Mono (angka tabular). Visual hero "portal" CSS dengan slot gambar opsional. Logo token = inisial di lingkaran berwarna.
- Copy UI bahasa Indonesia baku dengan "Anda", terkumpul di satu modul copy (pola swap-web).
- Status Detail parameter, banner likuidasi yang ditutup, dan catatan smart account yang ditutup disimpan di localStorage.

### Mode fork & Dev Tools (lending-web)

- Anvil fork 3 chain dengan blok di-pin, memakai **RPC archive (Alchemy)**. RPC publik menolak permintaan state lama dan merusak fork Base dalam hitungan menit (V7).
- Saat fork dinyalakan: `anvil_setCode(akun, 0x)` untuk **semua** akun tes yang dipakai, termasuk akun likuidator. Akun dev Anvil #0–#2 di Ethereum dan Base mainnet punya delegasi EIP-7702. Script swap-web baru membersihkan akun #0, jadi jangan disalin mentah.
- Dev Tools (fork saja): fitur Dev Tools swap-web, plus:
  - **Maju waktu** +1 hari / +30 hari / +1 tahun (`evm_increaseTime` + mine).
  - **Ubah harga oracle**: deploy mock aggregator (`latestAnswer`, 8 desimal) → impersonate `ACL_ADMIN` (punya `POOL_ADMIN`) → `AaveOracle.setAssetSources([aset], [mock])` → selanjutnya cukup `mock.setAnswer`. Sudah diuji di fork Ethereum (V7).
  - **Simulasi likuidasi**: akun tes lain memanggil `Pool.liquidationCall` terhadap posisi user tes.

### Indexer (repo: lending-indexer)

- Ponder mendengarkan Pool di 3 chain: `Supply`, `Withdraw`, `Borrow`, `Repay`, `LiquidationCall`, `ReserveUsedAsCollateralEnabled/Disabled`, `DeficitCreated`. Juga `Transfer` aWETH yang tujuannya WrappedTokenGateway, dan `Transfer` aToken dari borrower ke treasury di tx likuidasi.
- **Pemilik posisi dari field event, bukan `txFrom`**: Supply/Borrow → `onBehalfOf`; Repay/Withdraw/LiquidationCall → `user`. Pengecualian withdraw ETH: `Withdraw.user` = gateway, jadi pemilik diambil dari `Transfer` aWETH user → gateway di tx yang sama.
- **Likuidasi**: simpan `debtToCover` (utang yang benar-benar dilunasi), `liquidatedCollateralAmount` (bagian likuidator), protocol fee dari `Transfer` aToken ke treasury (apa adanya, bukan dihitung), bonus yang berlaku (kategori E-Mode kalau user di E-Mode dan aset jaminannya di `collateralBitmap`, selain itu bonus reserve), dan HF sebelum likuidasi dari `getUserAccountData` di blok −1 (butuh archive; kalau gagal, simpan "tidak tersedia"). Penalti = total − total/bonus, dengan total = bagian likuidator + protocol fee. `DeficitCreated` di tx yang sama dicatat sebagai sisa utang yang dihapus.
- **Event jaminan otomatis** (supply pertama, saldo habis, likuidasi) digabung ke baris transaksinya; baris Collateral tersendiri hanya untuk toggle manual.
- Jumlah disimpan sebagai bigint mentah; format di frontend.
- API: Hono GraphQL, satu daftar riwayat semua chain per alamat dengan filter chain dan jenis, plus status sinkron per chain untuk badge indexer.

### Riwayat (lending-web)

- Riwayat lokal (transaksi dari app) digabung dengan data indexer, dengan deduplikasi berdasarkan txHash (pola swap Q17).
- Badge "Riwayat mungkin belum lengkap" kalau indexer tertinggal atau mati.
- Banner likuidasi memakai data indexer: likuidasi 30 hari terakhir yang belum ditutup (txHash + logIndex di localStorage), digabung kalau lebih dari satu.
- Semua waktu relatif ("30 hari terakhir", "x menit lalu") dihitung terhadap timestamp blok terbaru chain transaksi itu, bukan `Date.now()` (Q30), supaya benar di fork setelah "maju waktu" dan saat jam Anvil tertinggal.

## Testing Decisions

Test yang baik menguji **perilaku dari luar** (input → output yang dilihat user atau kontrak), bukan detail implementasi. Fixture dari data on-chain asli. Format describe positive / negative / edge case seperti swap-web. Nggak menguji perilaku library (wagmi, TanStack Query, RainbowKit), dan nggak ada target coverage persen.

Seam (Q25):

1. **Modul domain murni (seam utama, Jest).** Ringkasan semua chain (HF terendah, batas pinjam terpakai tertinggi, chain berbahaya, belum lengkap dengan "≤"/"bisa saja lebih tinggi"), simulasi kelima aksi, harga likuidasi (semua varian `LiqPrice`), tingkat konfirmasi #9, filter daftar (saldo 0, Dibekukan, Dijeda, nonaktif), label posisi Dibekukan/Dijeda, aset luar, **MAX per aksi** (Q26: cadangan gas ETH, batas LTV, withdraw semua, repay penuh vs persis, MAX borrow yang tetap memicu tier #9), **kapasitas pool** (Q27: supply cap, borrow cap, cap 0, likuiditas), HF sesudah kedua pilihan di panel penyelamatan (Q29), dan waktu relatif dari timestamp blok (Q30). Fixture dengan field isolation mode lama yang tidak nol tidak boleh mengubah hasil (Q28). **Wajib (Q13)**: simulasi HF, sisa batas pinjam, harga likuidasi, dan filter daftar borrow, masing-masing dengan E-Mode aktif dan nonaktif, termasuk aset di luar `collateralBitmap`, aset di `ltvzeroBitmap`, dan kategori `isolated`. Ke-9 state Q22 prototype diuji di level ini dan level 2, bukan di browser. Prior art: test `src/core` swap-web.
2. **`nextStep` (Jest).** Semua cabang urutan prioritas, termasuk kapasitas pool, Dibekukan vs Dijeda, ganti network, approve exact vs berbantalan (repay penuh, withdraw semua ETH), credit delegation, ETH kurang untuk gas, Dijeda, dan penolakan di setiap langkah. Prior art: `nextStep.spec` swap-web.
3. **Adapter Aave di Anvil fork (Jest fork, satu Anvil per chain, snapshot/revert per test).** Baca posisi nyata; supply/withdraw/borrow/repay ERC20 dan ETH lewat gateway (termasuk withdraw semua ETH berbantalan dan repay penuh tanpa debu); toggle jaminan; Dev Tools (ubah oracle, maju waktu, likuidasi oleh akun lain); `anvil_setCode` untuk semua akun tes.
   - **Test paritas**: untuk beberapa posisi nyata di fork (jaminan ETH + utang stable, campuran, E-Mode aktif, ada aset luar), HF, total jaminan, total utang, dan sisa batas pinjam hasil modul domain harus sama dengan `getUserAccountData`. Toleransi sekecil mungkin; setiap selisih pembulatan disebut sebabnya (mis. `percentMul`/`wadDiv` kontrak vs aritmetika modul).
   - Matriks lengkap di Ethereum; Base dan Arbitrum hanya kasus khusus chain itu (Base: L1 fee, tanpa USDT; Arbitrum: USDCn vs USDC.e frozen sebagai aset luar). Prior art: `test/fork` swap-web.
4. **Handler indexer (Vitest + fixture Anvil terpisah tanpa revert).** Atribusi pemilik untuk semua event (termasuk depositETH/borrowETH lewat `onBehalfOf` dan withdraw ETH lewat `Transfer` aWETH), likuidasi (protocol fee dari `Transfer` ke treasury, bonus E-Mode vs reserve, `DeficitCreated`, HF blok −1 dan fallback "tidak tersedia"), dan penggabungan event jaminan otomatis. Prior art: test integrasi swap-indexer.
5. **E2E Playwright (connector fork).** Alur utama supply → borrow → repay, plus skenario reject. Prior art: `e2e/swap.spec` swap-web.

Plus smoke test transaksi beneran nominal kecil di tiap chain sebelum selesai (pola Q23 swap), termasuk verifikasi L1 fee Base.

## Out of Scope

- Kontrak lending buatan sendiri; deploy ke hosting.
- E-Mode: mengaktifkan atau mengganti kategori (V2). Di V1 E-Mode hanya dibaca.
- Repay pakai jaminan, swap jaminan (nanti).
- Aksi untuk aset luar (tetap read-only, dikelola di app.aave.com).
- Chain selain Ethereum, Base, Arbitrum; aset selain whitelist.
- Credit delegation ke pihak lain, flash loan, GHO, staking, governance, rewards/incentives.
- `withdrawETHWithPermit` dan permit lain untuk aToken.
- Notifikasi di luar app (email, push).

## Further Notes

- Teks lama di DECISIONS.md yang ditimpa keputusan lebih baru sudah dicoret di sana (2026-10-27); spec ini memakai versi terbaru:
  - Q12 J2 menulis daftar pinjam "hanya `borrowingEnabled`"; yang berlaku #4 (`borrowableBitmap` di E-Mode, tanpa frozen/paused).
  - #9 dan Q2 menyebut warna hijau/kuning/merah; yang berlaku Q20: Aman netral, Waspada amber, Bahaya merah, aksen violet hanya untuk aksi.
  - Q20 menyebut "aksen hijau" di baris referensi; aksen final violet (catatan akhir Q20).
- Fakta on-chain yang dipakai spec ini dicek 2026-10-27 (V1–V7). Kalau Aave meng-upgrade Pool (`POOL_REVISION` ≠ 11), cek ulang aturan E-Mode dan event sebelum melanjutkan.
- Prototype di branch `prototype/dashboard` hanya acuan visual dan alur; jangan digabung ke `main`. Rumus di prototype boleh jadi titik awal modul domain, tapi ditulis ulang dengan test.
- Review spec 2026-10-27 menambahkan Q26–Q30. Usulan isolation mode level reserve tidak dipakai karena fiturnya sudah dihapus di v3.7 (Q28, V8); kalau Aave menambahkannya lagi, ini perlu spec baru.
- Persona dan journey (J1 Supply, J2 Borrow, J3 Pantau & selamatkan) ada di DECISIONS.md Q12 dan jadi acuan urutan tiket.
