# Lending

App lending di atas pool Aave V3 di beberapa chain: user menyimpan aset, meminjam dengan jaminan, dan memantau risiko likuidasi semua chain dari satu dashboard.

## Posisi

**Posisi**:
Seluruh supply dan utang satu alamat di pool Aave pada satu chain. Satu alamat punya paling banyak satu posisi per chain.
_Avoid_: akun, portofolio

**Jaminan**:
Bagian supply yang sedang diaktifkan sebagai collateral, sehingga dihitung untuk batas pinjam dan health factor.
_Avoid_: deposit, agunan

**Health factor (HF)**:
Angka keamanan sebuah posisi: nilai jaminan × liquidation threshold dibagi utang. Di bawah 1, posisi bisa dilikuidasi.
_Avoid_: skor keamanan, health score

**Tingkat risiko**:
Label dari HF: Aman (≥ 2.0), Waspada (1.5–2.0), Bahaya (< 1.5). Ambangnya sama untuk HF saat ini dan HF setelah transaksi.
_Avoid_: status, level

**Sisa batas pinjam**:
Nilai yang masih bisa dipinjam sebelum menyentuh batas LTV.
_Avoid_: borrow power, available to borrow

**Likuidasi**:
Penjualan jaminan oleh pihak lain untuk melunasi utang posisi yang HF-nya di bawah 1, ditambah penalti likuidasi. Bisa sebagian (paling banyak separuh total utang, kalau HF masih di atas 0,95 dan jaminan maupun utang yang dilikuidasi masing-masing minimal $2.000) atau seluruh utang aset itu.
_Avoid_: lelang

**Penalti likuidasi**:
Bagian jaminan yang hilang di atas nilai utang yang dilunasi saat likuidasi. Dihitung dari jaminan yang hilang: total − total/bonus, dengan bonus likuidasi kategori E-Mode atau aset jaminan. Ditampilkan dalam token, USD, dan persen. Sudah termasuk biaya protokol.
_Avoid_: denda, liquidation penalty, liquidation bonus, bonus likuidasi (bonus itu sudut pandang likuidator)

**Biaya protokol**:
Bagian penalti likuidasi yang masuk ke treasury Aave, bukan ke likuidator. Diambil dari jaminan user di transaksi yang sama, jadi ikut dihitung sebagai jaminan yang hilang.
_Avoid_: protocol fee, liquidation protocol fee, fee treasury

**Sisa utang dihapus**:
Utang yang masih tersisa ketika likuidasi menghabiskan seluruh jaminan sebuah posisi. Aave menghapusnya dari posisi (event `DeficitCreated`), jadi user tidak lagi menanggungnya. Ditampilkan "sisa utang <x> dihapus".
_Avoid_: deficit, bad debt, utang macet, pemutihan

## Dashboard

**Ringkasan**:
Bagian teratas dashboard: total supply, total utang, net, dan HF terendah dari semua chain yang didukung.
_Avoid_: overview, total aset

**HF terendah**:
HF paling kecil di antara posisi yang punya utang, di semua chain.

**Ringkasan belum lengkap**:
Keadaan ringkasan ketika posisi di satu chain atau lebih gagal dibaca. Angkanya tidak boleh dianggap final.

**Kartu chain**:
Ringkasan satu posisi (HF, supply, utang, kecukupan ETH untuk gas) yang bisa diklik untuk memilih chain.

**Chain terpilih**:
Chain yang detail posisinya sedang ditampilkan di app. Bisa beda dengan network wallet.
_Avoid_: chain aktif, network aktif

**Chain berbahaya**:
Chain yang posisinya bertingkat risiko Bahaya. Hanya chain ini yang memunculkan banner.

**Panel penyelamatan**:
Panel yang dibuka dari "Lihat <chain>" di banner chain berbahaya, menggantikan panel aksi sampai user memilih. Menawarkan dua cara menaikkan HF, Repay atau Supply jaminan, masing-masing dengan HF sesudah MAX-nya dari aset yang paling menaikkan HF.
_Avoid_: rescue panel, panel darurat

## Transaksi

**Langkah wallet**:
Satu permintaan ke wallet (ganti network, approve, delegasi kredit, atau transaksi utama) yang ditampilkan ke user sebelum popup wallet muncul.

**Alamat resmi**:
Alamat kontrak Aave yang tercantum di Aave address book untuk chain tersebut.

**MAX**:
Jumlah terbesar untuk satu aksi yang tidak akan ditolak kontrak maupun dikunci app, dibatasi saldo, batas LTV, kapasitas pool, dan cadangan gas ETH. Kalau hasilnya seluruh saldo supply atau seluruh utang, MAX menjadi withdraw semua atau lunas penuh.
_Avoid_: maksimum, semua saldo

## Kapasitas pool

**Kapasitas pool**:
Seberapa banyak lagi sebuah reserve bisa menerima supply, pinjaman, atau penarikan, untuk semua user sekaligus: sisa kuota supply, sisa kuota pinjaman, dan likuiditas pool. Beda dengan sisa batas pinjam, yang milik satu posisi.
_Avoid_: limit pool, capacity

**Kuota supply**:
Batas total supply sebuah reserve yang ditetapkan Aave; kuota penuh berarti tidak ada supply baru yang diterima.
_Avoid_: supply cap, plafon supply (kecuali header "Detail parameter", lihat di bawah)

**Kuota pinjaman**:
Batas total utang sebuah reserve yang ditetapkan Aave, untuk semua peminjam sekaligus. Bukan batas pinjam milik satu posisi.
_Avoid_: borrow cap, plafon pinjaman, limit pinjam (kecuali header "Detail parameter")

Pengecualian: di "Detail parameter <chain>" header kolomnya "Supply cap" / "Borrow cap" dengan ⓘ "(kuota supply)" / "(kuota pinjaman)", karena di sana istilah asli Aave dipakai (Q8) supaya angkanya bisa dicocokkan dengan app.aave.com. Di luar Detail tetap "kuota supply" / "kuota pinjaman".

**Likuiditas pool**:
Aset sebuah reserve yang belum dipinjam, yang bisa dipinjam atau ditarik saat ini.
_Avoid_: available liquidity, dana pool

## Risiko

**Harga likuidasi**:
Harga ETH (oracle chain itu) yang membuat HF suatu posisi tepat 1, dengan harga aset lain dianggap tetap. Hanya ada kalau posisi bergantung pada satu aset volatil.
_Avoid_: liquidation price, harga lelang

**E-Mode**:
Kategori yang, kalau diaktifkan user, memberi LTV/LT khusus untuk aset jaminan di dalam kategori itu dan menentukan aset mana yang boleh dipinjam. Di app ini hanya dibaca, tidak diatur.
_Avoid_: efficiency mode, mode efisien

**Dibekukan**:
Status reserve yang tidak menerima supply atau pinjaman baru, tapi posisi lama masih bisa ditarik dan dilunasi.
_Avoid_: frozen, beku

**Dijeda**:
Status reserve yang untuk sementara menolak semua aksi, termasuk withdraw dan repay.
_Avoid_: paused, berhenti

**Aset luar**:
Aset dalam posisi user yang tidak ada di whitelist app. Ikut terhitung dalam risiko, tapi tampil read-only.
_Avoid_: aset lain, aset non-whitelist
