# Keputusan Desain: Lending ala Aave (proyek belajar)

Sumber keputusan sampai spec dibuat. Bagian "Keputusan scope" dan "Arahan desain"
sudah final (sesi belajar 2026-10-27). Hasil grilling (Q1–Q25) dan review spec (Q26–Q30), 2026-10-27, dicatat di bagian
"Keputusan per pertanyaan".

## Konteks

- App lending ala app.aave.com, dibangun di atas kontrak **Aave V3** yang sudah
  ada (bukan bikin kontrak sendiri). Arahan mentor (Mas Yan): "cari yang termudah".
- Sekaligus **redesign** Aave: menurut Mas Yan, desain app.aave.com masih jelek.
  Acuan: PDF "Basic UI/UX for dApps" (web3jogja).
- Stack & pola ikut `~/projects/swap-uniswap/swap-web` dan `swap-indexer`.

## Keputusan scope (final)

1. Kontrak: Aave V3 yang sudah ada (Pool, UiPoolDataProvider, WrappedTokenGateway, oracle).
2. Chain: Ethereum, Base, Arbitrum. Nambah chain = nambah 1 entri config.
3. Aset: data reserve dari UiPoolDataProvider, ditampilkan hanya yang ada di
   whitelist. Whitelist per chain berbasis **alamat**, bukan simbol (V6):
   Ethereum WETH/ETH, USDC, USDT · Base WETH/ETH, USDC (Aave Base nggak punya USDT) ·
   Arbitrum WETH/ETH, USDCn (USDC native; konstanta `USDC` di address-book = USDC.e
   yang frozen), USDT. Aset lain (mis. USDC.e, USDbC) cuma tampil sebagai aset luar
   (Q13). Parameter (LTV, threshold, borrowingEnabled, dll.) nggak di-hardcode karena
   beda per chain.
4. "Assets to supply": sembunyikan aset bersaldo 0, ada toggle "tampilkan semua".
   "Assets to borrow": di luar E-Mode ikut flag `borrowingEnabled`; kalau user di
   E-Mode, hanya aset di `borrowableBitmap` kategorinya (V4). Reserve frozen, paused,
   atau nonaktif disembunyikan **hanya dari daftar "Aset untuk supply" dan "Aset untuk
   dipinjam"** (klarifikasi 2026-10-27). Posisi user di reserve itu **tetap tampil** dan
   tetap dihitung di HF dan ringkasan, dengan label:
   - **Dibekukan** (frozen): withdraw dan repay masih bisa; supply dan borrow nonaktif.
   - **Dijeda** (paused): semua aksi nonaktif sementara.
5. ~~Dashboard: posisi chain terpilih saja.~~ **DIGANTI**, lihat "Dashboard semua chain".
6. ETH langsung lewat WrappedTokenGateway (withdraw ETH = approve aWETH ke gateway;
   borrow ETH = credit delegation).
7. V1: supply, withdraw, borrow, repay + simulasi HF (sebelum → sesudah) + toggle
   collateral. V2: E-Mode. Nanti: repay pakai jaminan / swap jaminan.
8. Approve default exact; unlimited hanya kalau user memilih. Repay full pakai
   max uint256; izin repay diberi bantalan karena bunga terus jalan. Hal yang sama
   untuk withdraw semua ETH lewat gateway: izin aWETH diberi bantalan, karena saldo
   aWETH bertambah oleh bunga antara approve dan withdraw (V2).
9. Tingkat peringatan HF (setelah transaksi; borrow, withdraw, matikan collateral):
   ≥ 2.0 ~~hijau~~ Aman (netral) · 1.5–2.0 ~~kuning~~ Waspada (amber) · 1.1–1.5
   Bahaya (merah) + centang · < 1.1 Bahaya (merah) + ketik "confirm" · melebihi
   batas LTV: tombol dikunci. (Warna dirapikan 2026-10-27 sesuai Q20.)
10. Dev Tools (fork saja): semua dari proyek swap + maju waktu (+1 hari/+30 hari/
    +1 tahun), ubah harga oracle (impersonate admin Aave), simulasi likuidasi.
11. Indexer wajib. Pemilik posisi dari field event, bukan `txFrom`:
    Supply/Borrow → `onBehalfOf`, Repay/Withdraw/Liquidation → `user`. Pengecualian
    withdraw ETH lewat gateway: `Withdraw.user` = gateway, jadi pemilik diambil dari
    `Transfer` aWETH user → gateway di tx yang sama (V2). Event: Supply, Withdraw,
    Borrow, Repay, LiquidationCall, ReserveUsedAsCollateralEnabled/Disabled,
    DeficitCreated, `Transfer` aWETH ke gateway, dan `Transfer` aToken borrower →
    treasury di tx likuidasi (protocol fee, V5).
12. Mode fork (Anvil) dan mainnet (Alchemy). Nggak deploy, jalan lokal saja.

## Arahan desain (final)

### Prinsip (PDF web3jogja)
- 5 prinsip dApp: Visible Trust, Confidence, Confirmation, In Control, Show the Risk.
- Laws of UX: Jakob (pola familiar Aave/Uniswap), Hick (kurangi pilihan, langkah
  kecil, progressive disclosure), Fitts (tombol aksi utama besar, mudah dijangkau).
- UI: clarity first, setiap aksi ada feedback, konsisten, pola mapan, pakai kata
  kalau ikon kurang jelas.
- Alur pool-based (slide 33): Choose Network → Choose Asset → Deposit;
  Choose Collateral → Choose Asset to Borrow → Borrow.

### Persona
- Utama: **user pro** (biasa pakai Aave, posisi di beberapa chain, mau cepat dan angka lengkap).
- Kedua: **user menengah** (sering swap, baru coba lending, takut salah).
- Progressive disclosure: tampilan awal simpel; detail lengkap (LTV, liquidation
  threshold, utilization, dll.) bisa dibuka, seperti detail swap yang collapsible.

### Dashboard semua chain (mengganti keputusan #5)
Satu halaman:
1. Ringkasan total: total aset, total utang, HF terendah dari semua chain, banner
   peringatan kalau ada chain berbahaya (tetap muncul walau chain lain dipilih).
2. Kartu per chain (Ethereum, Base, Arbitrum): HF, supply, utang. Klik kartu = pilih chain.
3. Detail chain terpilih: posisi + aksi (supply/withdraw/borrow/repay), mirip Aave.
Data posisi dibaca dari 3 chain sekaligus (multicall per chain).

### Pain point → solusi
1. Token ada tapi ETH 0, tx baru gagal setelah klik → cek gas sebelum klik: tombol
   utama jadi "ETH kurang untuk biaya jaringan" (nonaktif) + perkiraan ETH yang
   dibutuhkan + tautan "cara mendapatkan ETH". Juga tampil di kartu chain.
   Pola main-button CTA (Zenlink, PDF slide 13), seperti `needsEthForGas` di swap.
2. Wallet menandai kontrak "Malicious" → sebelum popup wallet, tampilkan alamat
   kontrak Aave yang diberi izin, tanda alamat resmi, tautan explorer.
3. Approve default Unlimited → default exact; unlimited hanya kalau user memilih.
4. Wallet menawarkan "smart account activation" / gas sponsor → sebelum popup,
   jelaskan singkat apa yang akan diminta wallet.
5. Utang tersembunyi di chain lain → dashboard semua chain.
6. Istilah sulit (APY, LTV, health factor) → bahasa sederhana di tampilan awal,
   tooltip ⓘ, detail lengkap bisa dibuka.

### Konsistensi dengan swap-web
Pola sama: tingkatan peringatan, detail collapsible, status tx multi-tahap
(pending → confirming → success + link explorer), CTA di tombol utama.

## Keputusan per pertanyaan

### Q1 — Repo
- `~/projects/lending-aave/lending-web` (Next.js) dan
  `~/projects/lending-aave/lending-indexer` (Ponder). File ini tinggal di `lending-web/`.

### Q2 — Chain berbahaya
- Tingkat risiko dari HF **saat ini**, ambang sama dengan #9: ≥ 2.0 Aman (~~hijau~~
  netral), 1.5–2.0 Waspada (~~kuning~~ amber), < 1.5 Bahaya (merah). (Warna dirapikan
  2026-10-27 sesuai Q20.)
- Banner dashboard hanya untuk Bahaya. Waspada cukup ditandai di kartu.
- Beberapa chain Bahaya: banner menyebut HF terendah dulu, lalu "+N chain lain".
- Tanpa utang: tulis "Tidak ada utang", bukan "∞".

### Q3 — Ringkasan total
- Total supply, total utang, net (supply − utang), dalam USD harga oracle Aave.
- HF terendah dihitung dari chain yang punya utang saja.
- Saldo wallet nggak masuk ringkasan (cuma di daftar "Assets to supply").

### Q4 — Chain gagal dibaca
- Kartu: "Gagal dimuat" + "Coba lagi".
- Ringkasan diberi label "Belum lengkap (2/3 chain)"; HF terendah ditulis
  "≤ x · <chain> belum terbaca, bisa lebih rendah" (koreksi 2026-10-27: awalnya
  tertulis "≥", terbalik, karena chain yang belum terbaca bisa saja HF-nya lebih rendah). Ringkasan nggak pernah tampil lengkap kalau ada
  chain yang gagal.
- Auto-refresh berkala (±30 detik) + saat tab difokuskan.
- **Klarifikasi 2026-10-28** (permintaan user setelah review tiket 12): chain dianggap
  gagal kalau bacaan **terakhir** error, walau data lama masih ada; ringkasan
  menghitungnya "belum terbaca" (Belum lengkap, "≤", "bisa saja lebih tinggi"), sama
  dengan detail chain. **Banner Bahaya tetap tampil** dari bacaan terakhir yang berhasil,
  dengan umur datanya: "(data 2 menit lalu, belum bisa diperbarui)". Banner nggak boleh
  hilang atau berganti chain cuma karena satu bacaan gagal.
- Umur data itu dihitung dari jam perangkat sejak bacaan terakhir berhasil, bukan dari
  timestamp blok (pengecualian Q30): yang diukur kapan app terakhir berhasil membaca, dan
  chain yang gagal dibaca memang nggak punya timestamp blok baru.

### Q5 — Pilih chain vs network wallet
- Klik kartu cuma memilih chain di app (URL `?chain=`), tanpa `switchChain`.
- `switchChain` diminta saat transaksi: tombol utama "Ganti ke <chain>", jadi
  langkah di `nextStep`.

### Q6 — Sebelum wallet terhubung
- Ringkasan & kartu: ajakan "Hubungkan wallet untuk melihat posisi di 3 chain".
- Detail chain tetap menampilkan daftar aset + APY (read-only).

### Q7 — Tampilan awal vs Detail
- Tampilan awal: saldo/jumlah, APY ("bunga per tahun"), HF + label tingkat risiko,
  sisa batas pinjam, HF sebelum → sesudah, **harga likuidasi** (lihat ronde 2).
- Detail ▾: LTV, liquidation threshold, liquidation penalty, utilization, reserve
  factor, supply/borrow cap, harga oracle, alamat reserve/aToken.
- Status buka/tutup Detail diingat (localStorage).

### Q8 — Istilah
- Istilah asli Aave tetap dipakai, didampingi penjelasan sederhana + ⓘ.
  Contoh: `Health factor 1,82 · Aman ⓘ`. Copy UI pakai "Anda" (sama dengan swap-web).

### Q9 — Penjelasan sebelum popup wallet
- Inline di panel aksi, di atas tombol utama: daftar langkah yang akan diminta
  wallet (approve/delegasi/tx), masing-masing dengan alamat kontrak, tanda resmi,
  dan link explorer. Tanpa layar review terpisah.
- **Semua alamat** diambil dari `@bgd-labs/aave-address-book` per chain; mode
  fork pakai alamat mainnet. (Alamat Base Sepolia dari sesi praktik nggak dipakai.)
- Catatan smart account / gas sponsor: satu baris kecil yang bisa ditutup dan
  nggak muncul lagi setelah ditutup.

### Q10 — Cek gas
- Kartu chain: perkiraan kasar = gasPrice × gas tipikal aksi Aave (dikalibrasi
  dari `gasUsed` di fork). Saldo ETH kurang → badge "ETH kurang untuk bertransaksi".
- Panel aksi: `estimateGas` asli (+ L1 fee Base), termasuk approve yang tersisa
  (pola Q12 swap).
- "Cara mendapatkan ETH": halaman bantuan di app; mode fork → faucet Dev Tools.

### Q11 — Choose Collateral
- Tanpa wizard. Panel borrow menampilkan "Jaminan Anda di <chain>: … · Ubah".
  Belum ada jaminan → tombol utama "Supply jaminan dulu" (membuka panel supply).

### Q12 — User journey
Tiga journey. Withdraw/repay biasa ikut pola J1/J2.

**J1 Supply** (menengah)
| Stage | Pain point | Solusi |
|---|---|---|
| Hubungkan wallet | Ragu app ini asli | Alamat resmi + explorer (Q9) |
| Pilih chain | Nggak tahu chain mana yang ada asetnya | Kartu chain + saldo wallet per chain |
| Pilih aset | Daftar panjang | Sembunyikan saldo 0 (#4) |
| Isi jumlah | Nggak paham APY | Bunga per tahun + perkiraan hasil/tahun |
| Siapkan tx | ETH 0, smart account, "Malicious" | Pain point 1, 2, 4 |
| Approve → Supply | Unlimited, nggak tahu progres | Default exact, status multi-tahap |
| Selesai | "Uangku ke mana?" | Posisi langsung terupdate + link explorer |

**J2 Borrow** (menengah)
| Stage | Pain point | Solusi |
|---|---|---|
| Pastikan jaminan | Nggak tahu supply = jaminan | Baris jaminan + CTA (Q11) |
| Pilih aset pinjam | Takut salah pilih | ~~Hanya `borrowingEnabled`~~ Daftar pinjam sesuai #4 (`borrowableBitmap` kalau di E-Mode; tanpa reserve frozen/paused) + APY pinjam |
| Isi jumlah | Nggak tahu batas aman | Sisa batas pinjam + HF sebelum → sesudah |
| Konfirmasi risiko | Nggak sadar risiko likuidasi | Tier #9 (centang / ketik confirm) |
| Borrow → selesai | Sama seperti J1 | Status multi-tahap |

**J3 Pantau & selamatkan** (pro)
| Stage | Pain point | Solusi |
|---|---|---|
| Buka app | Utang di chain lain tersembunyi | Ringkasan + HF terendah (Q2–Q4) |
| Lihat peringatan | Cari sendiri chain yang bahaya | Banner + "Lihat <chain>" |
| Ambil tindakan | Bingung repay atau tambah jaminan | Panel menawarkan Repay / Supply jaminan + HF sesudah (Q29) |
| Ganti network & tx | ETH kurang di chain itu | Badge ETH di kartu (Q10) |
| Sudah dilikuidasi | Nggak tahu kenapa jaminan berkurang | Riwayat LiquidationCall dari indexer: jaminan yang dijual, jumlah, penalti, HF waktu itu; banner sekali di dashboard "Posisi Anda di <chain> dilikuidasi pada <waktu>" (detail di ronde 2) |

### Q13 — Aset di luar whitelist & E-Mode dari app.aave.com
- Total, HF, dan sisa batas pinjam selalu dari `getUserAccountData`, jadi semua aset
  ikut terhitung.
- Aset non-whitelist tampil sebagai baris read-only: "<aset> · dikelola di
  app.aave.com ↗", tanpa aksi.
- **E-Mode (baca saja di V1)**: baca kategori user (`userEmodeCategoryId`) dan data
  kategori (`getEModes`). Kalau aktif, semua simulasi HF, sisa batas pinjam, dan harga
  likuidasi pakai nilai **per aset** sesuai aturan v3.7 (V4):
  - LT: aset di `collateralBitmap` → LT kategori; aset lain → LT reserve.
  - LTV: aset di `collateralBitmap` → LTV kategori, atau 0 kalau ada di `ltvzeroBitmap`;
    aset lain → 0 kalau kategori `isolated`, selain itu LTV reserve.
  - Daftar borrow = aset di `borrowableBitmap` (#4).
  - Teks read-only dari isi kategori, bukan label on-chain (label di-soft-deprecate
    sejak v3.6): "E-Mode aktif · jaminan: ETH, wstETH · pinjaman: ETH · diatur di
    app.aave.com ↗". Label on-chain hanya di Detail.
- **Test wajib**: simulasi HF, sisa batas pinjam, harga likuidasi, dan filter daftar
  borrow, masing-masing dengan E-Mode aktif dan nonaktif, termasuk aset di luar
  `collateralBitmap`, aset di `ltvzeroBitmap`, dan kategori `isolated`.

### Q14 — Rumus harga likuidasi
- Satu-satunya aset volatil di whitelist adalah ETH (ETH = WETH), jadi HF ditulis
  sebagai fungsi harga ETH lalu dicari P saat HF(P) = 1:
  `HF(P) = (Σ jaminan_eth×P×LT + Σ jaminan_stable×LT) / (utang_eth×P + utang_stable)`.
- LT per aset = LT efektif (kategori E-Mode kalau berlaku, Q13). Stablecoin dianggap
  tetap di harga oracle saat ini.
- Teks: jaminan ETH + utang stable → "Dilikuidasi kalau ETH turun ke $x (−y%)";
  jaminan stable + utang ETH → "…naik ke $x (+y%)"; HF < 1 → "Sudah bisa dilikuidasi
  sekarang"; tanpa utang → disembunyikan.
- **Tanpa solusi P > 0** (mis. jaminan & utang sama-sama ETH, atau stable saja) →
  "Tidak dipengaruhi harga ETH".
- Ada aset volatil lain (dari Q13) → disembunyikan, diganti "Harga likuidasi tidak
  bisa dihitung untuk campuran aset ini, lihat Health factor". Opsi "turun X%" nggak dipakai.

### Q15 — Lokasi harga likuidasi
- Detail chain (di samping HF) dan panel aksi (sebelum → sesudah).
- Kartu chain: hanya untuk chain Bahaya.
- Label "saat ini"; dihitung per chain pakai oracle chain itu.

### Q16 — HF & penalti di riwayat likuidasi
- Indexer membaca `getUserAccountData(user)` pada block sebelum likuidasi dan
  menyimpannya ("HF sebelum likuidasi ≈ x"). Butuh RPC archive (Alchemy; Anvil
  meneruskan block lama ke upstream).
- Jaminan yang hilang = `liquidatedCollateralAmount` (ke likuidator) + protocol fee
  (dari `Transfer` aToken borrower → treasury di tx yang sama, disimpan apa adanya, bukan
  dihitung). Penalti = total − total/bonus, dengan bonus kategori E-Mode kalau user di
  E-Mode dan aset jaminannya di `collateralBitmap`, selain itu bonus reserve (V5). Dalam
  token dan USD.
- Kalau ada `DeficitCreated` di tx itu, riwayat menulis "sisa utang <x> dihapus".
- Baca block lama gagal → riwayat tetap tampil, HF "tidak tersedia".

### Q17 — Banner likuidasi
- Likuidasi 30 hari terakhir yang belum ditutup. ✕ menyimpan txHash+logIndex di
  localStorage (device baru boleh muncul lagi).
- Beberapa likuidasi digabung jadi satu banner + "Lihat riwayat".
- Posisinya di bawah banner Bahaya (Q2).

### Q18 — Halaman riwayat
- Semua chain dalam satu daftar, terbaru di atas, filter chain + jenis
  (Supply/Withdraw/Borrow/Repay/Likuidasi/Collateral).
- Event jaminan yang terpancar otomatis (supply pertama, saldo habis, likuidasi)
  digabung ke baris transaksinya, mis. "Supply 1 ETH · jaminan aktif". Baris
  "Collateral" tersendiri hanya untuk toggle manual (V3).
- Riwayat lokal + indexer digabung (pola Q17 swap). Indexer mati → badge "Riwayat
  mungkin belum lengkap" (pola `indexerBadge`).

### Q19 — Panel aksi
- Desktop: panel di samping detail chain (ringkasan & banner tetap kelihatan).
- Mobile: bottom sheet layar penuh, tombol utama menempel di bawah.

### Q20 — Tema visual (DIUBAH 2026-10-27)
- ~~Sistem desain swap-web (tema Zardex violet).~~ Diganti atas permintaan user setelah
  review visual prototype pertama (terasa "AI slop"). Referensi: dashboard gaya Bitlend,
  ~~aksen hijau~~ aksen violet (lihat catatan akhir Q20). Gambar referensi nggak dipakai (hak cipta).
- Layout: sidebar kiri (wordmark, Dashboard, Riwayat, "E-Mode" redup + badge SEGERA;
  footer = status per chain: blok terbaru + status indexer sinkron/tertinggal/offline).
  Hero = ringkasan semua chain: satu angka raksasa HF terendah + skala HF (1,0 → 1,5 →
  2,0 → 3,0+, penanda per chain), statistik bersekat (total supply · total utang · net),
  bar batas pinjam. Banner Bahaya/likuidasi menempel di atas hero. Chain = segmen ringkas
  di bawah hero. Aset = tabel datar (aset + logo, APY, wallet, jaminan); klik baris membuka
  panel aksi di kanan (Q19), aksi dipilih lewat tab panel. Logo token = inisial dalam
  lingkaran berwarna (tanpa aset bermerek). Visual hero = CSS saja ("portal" cahaya ~~hijau~~ violet),
  dengan slot gambar opsional.
- Warna: latar hampir hitam netral, satu aksen (awalnya hijau mint, lalu violet; lihat di bawah) untuk aksi, pilihan aktif, dan
  angka hero. HF Aman = netral; hanya Waspada (amber) dan Bahaya (merah) yang berwarna.
  Angka hero ikut amber/merah kalau HF terendah Waspada/Bahaya (Show the Risk). Semua
  warna lewat CSS variable di `globals.css`.
- Font: Unbounded (display: 200 angka hero, 700 wordmark), IBM Plex Sans (teks),
  IBM Plex Mono (angka tabel & alamat, tabular). Lompatan ukuran hero vs teks ≥ 3×.
- Motion: satu page-load dengan reveal bertahap (hero → segmen chain → tabel); mati
  kalau `prefers-reduced-motion`.
- Prototype cukup satu varian (A/B/C dibuang).
- **Aksen diganti violet** (`#a78bfa`, 2026-10-27, permintaan user setelah melihat versi mint).
  Aturannya tetap: satu aksen untuk aksi, pilihan aktif, dan angka hero (kalau Aman);
  Aman netral, Waspada amber, Bahaya merah. Warna chain Ethereum dan logo ETH digeser ke
  abu-biru supaya nggak tertukar dengan aksen.

### Q21 — Kartu chain tanpa posisi
- "Belum ada posisi · <saldo terbesar aset whitelist> di wallet bisa di-supply";
  wallet kosong → "Belum ada posisi". Ringkasan tetap tanpa saldo wallet.

### Q22 — Prototype sebelum spec
- Urutan: grilling → `/prototype` (data palsu) → review Mas Yan → verifikasi
  daftar "Perlu diverifikasi" (boleh `/research`) → `/to-spec` → `/to-tickets` →
  implementasi. Spec & tiket harus berdasarkan fakta yang sudah dicek.
- Prototype mencakup dashboard, ringkasan, kartu chain, panel supply/borrow, dan
  state berikut yang bisa diganti lewat toggle:
  - belum connect wallet
  - loading, dan satu chain "Gagal dimuat" (ringkasan "Belum lengkap 2/3")
  - banner Bahaya + banner likuidasi sekaligus
  - ETH kurang untuk gas (tombol utama + link cara dapat ETH)
  - langkah approve → supply dengan penjelasan inline sebelum popup wallet (Q9)
  - tier HF: kuning, merah + centang, < 1,1 ketik "confirm", lewat LTV dikunci
  - status tx multi-tahap (pending → confirming → success + link explorer)
  - E-Mode aktif (read-only) dan aset luar whitelist
  - tampilan mobile (bottom sheet)

### Q23 — ADR
- Dashboard semua chain dicatat di `docs/adr/0001-dashboard-semua-chain.md`.

### Q24 — Batas pinjam di hero
- Hero menampilkan batas pinjam terpakai **tertinggi per chain**, bukan total. Contoh:
  "Batas pinjam terpakai · tertinggi: Base 82% · sisa $340".
- Alasan: batas pinjam berlaku per chain, jadi total semua chain bisa terlihat aman
  padahal satu chain hampir mentok. Total begitu melanggar ADR 0001 (nggak boleh ada
  risiko tersembunyi) dan nggak konsisten dengan hero yang memakai HF terendah, bukan
  rata-rata. Total supply/utang/net tetap dijumlah karena itu nilai, bukan batas risiko.
- Pemakaian per chain tetap terlihat di segmen chain. Chain yang gagal dibaca ditandai
  "belum terbaca, bisa saja lebih tinggi" (sejalan dengan Q4).
- Tanpa utang di chain mana pun: bar disembunyikan.
- Warna bar (dan titiknya) ikut tingkat risiko HF chain yang ditampilkan: Aman = netral,
  Waspada = amber, Bahaya = merah, sama seperti garis di segmen chain. Nggak ada ambang
  persen baru untuk bar ini; sumber warnanya tetap tier HF. Aksen hanya untuk aksi.

### Q25 — Seam test (disetujui 2026-10-27)
Pola mengikuti Q23 swap-web.
1. **Modul domain murni (seam utama, Jest)**. Input: data reserve, data user, kategori
   E-Mode, dan harga (bentuk data UiPoolDataProvider). Output: ringkasan semua chain (HF
   terendah, batas pinjam terpakai tertinggi, chain berbahaya, belum lengkap), simulasi
   aksi (HF sesudah, harga likuidasi, sisa batas pinjam), tingkat konfirmasi #9, dan
   filter daftar (Dibekukan/Dijeda, E-Mode). Semua test wajib Q13 ada di sini. Fixture
   dari data on-chain asli.
2. **`nextStep` (Jest)**: ganti network, approve exact/berbantalan, credit delegation,
   tx utama, ETH kurang untuk gas.
3. **Adapter Aave di Anvil fork (Jest fork, satu Anvil per chain)**: baca posisi nyata,
   supply/borrow/repay/withdraw termasuk lewat gateway, Dev Tools (oracle, maju waktu,
   likuidasi), `anvil_setCode` untuk semua akun tes.
   - **Test paritas**: untuk beberapa posisi nyata di fork (jaminan ETH + utang stable,
     campuran, E-Mode aktif, ada aset luar), HF, total jaminan, total utang, dan sisa
     batas pinjam hasil modul domain harus sama dengan `getUserAccountData` kontrak.
     Toleransi sekecil mungkin; setiap selisih pembulatan harus disebut sebabnya (mis.
     pembulatan `percentMul`/`wadDiv` kontrak vs aritmetika modul).
4. **Handler indexer (Vitest + fixture Anvil, pola swap-indexer)**: atribusi pemilik
   (termasuk withdraw ETH via `Transfer` aWETH), penalti dari protocol fee,
   `DeficitCreated`, penggabungan event jaminan otomatis.
5. **E2E Playwright**: alur utama (supply → borrow → repay) + skenario reject saja.
   9 state Q22 diuji di level 1–2, tidak diulang di browser.

### Q26 — MAX per aksi (review spec 2026-10-27)
- **Supply**: ERC20 → saldo wallet; ETH → saldo − cadangan gas (pola `maxSpendable`
  swap-web tiket 14). Keduanya dibatasi sisa supply cap (Q27).
- **Withdraw**: yang terkecil dari saldo supply, jumlah yang masih menjaga posisi di
  bawah batas LTV (#9; jaminan yang dibutuhkan utang tidak ikut), dan likuiditas pool
  (Q27). Kalau hasilnya = seluruh saldo dan tanpa utang yang bergantung padanya, kirim
  `type(uint256).max` supaya nggak ada sisa debu bunga (ETH: izin aWETH berbantalan, #8).
- **Borrow**: sampai batas LTV, dibatasi sisa borrow cap dan likuiditas pool (Q27).
  MAX **tidak melewati** konfirmasi risiko: tier #9 (centang / ketik "confirm") tetap
  berlaku untuk jumlah hasil MAX.
- **Repay**: min(utang, saldo wallet); repay ETH menyisakan cadangan gas. Pakai
  `type(uint256).max` hanya kalau saldo cukup untuk melunasi semua + bantalan bunga;
  selain itu kirim jumlah persis.

### Q27 — Kapasitas pool (review spec 2026-10-27)
- Modul domain dan `nextStep` mengecek supply cap, borrow cap, dan likuiditas tersedia
  (`virtualUnderlyingBalance`) dengan aturan kontrak (V8). Aksi yang pasti ditolak
  kontrak → tombol dikunci dengan pesan jelas, mis. "Kuota supply aset ini penuh",
  "Kuota pinjaman aset ini penuh", "Likuiditas pool tidak cukup, tersedia X".
- MAX (Q26) sudah memperhitungkan kapasitas ini, jadi MAX nggak pernah menghasilkan
  jumlah yang ditolak karena kapasitas.

### Q28 — Isolation mode level reserve: tidak ada di v3.7 (review spec 2026-10-27)
- Usulan review: deteksi jaminan isolated (debt ceiling, `borrowableInIsolation`) dan
  batasi daftar pinjam. **Tidak dipakai**, karena fiturnya sudah dihapus di v3.7 (V8):
  isolation mode dan siloed borrowing dihapus, aset yang dulu ber-debt-ceiling sudah
  LTV 0, dan Aave meminta frontend menghapus UI status isolation mode.
- Keputusan: tidak ada UI atau logika isolation mode. Field lama di UiPoolDataProvider
  (`debtCeiling`, `borrowableInIsolation`, `isolationModeTotalDebt`, `isSiloedBorrowing`)
  diabaikan. Pembatasan yang masih berlaku ditangani lewat E-Mode `isolated`/`ltvzero`
  (Q13) dan aturan ltv0 (V6). Kalau `POOL_REVISION` berubah, cek ulang.

### Q29 — "Lihat <chain>" di banner Bahaya (review spec 2026-10-27)
- Tombol "Lihat <chain>" memilih chain itu dan membuka panel **penyelamatan** yang
  menawarkan dua pilihan sesuai J3: **Repay** atau **Supply jaminan**, masing-masing
  dengan HF sesudah (dihitung dari MAX yang masuk akal untuk user: repay = Q26, supply
  jaminan = saldo wallet aset jaminan yang tersedia). Bukan langsung ke tab Repay.
- Memilih salah satu membuka tab aksi itu dengan jumlah kosong.

### Q30 — Waktu relatif dari timestamp blok (review spec 2026-10-27)
- Semua waktu relatif (banner likuidasi 30 hari, "x menit lalu" di riwayat) dihitung
  dari **timestamp blok terbaru chain itu**, bukan `Date.now()`, supaya tetap benar di
  fork setelah "maju waktu" dan saat jam Anvil tertinggal.

## Hasil verifikasi (spike 2026-10-27)

Sumber yang dicek:
- **Kode**: `aave-dao/aave-v3-origin` commit `8305565` (main). File yang dibaca identik dengan
  tag `v3.7.0` (`git diff v3.7.0 HEAD` kosong untuk IPool, LiquidationLogic, GenericLogic,
  ValidationLogic, DataTypes, UserConfiguration, WrappedTokenGatewayV3, UiPoolDataProviderV3).
- **Versi ter-deploy**: `Pool.POOL_REVISION()` = **11** di Ethereum (blok 26.282.495), Base
  (53.148.064), dan Arbitrum (518.672.995) = **Aave v3.7** (`docs/3.7/Aave-v3.7-changelog.md`:
  "POOL_REVISION bumped from 10 to 11").
- **Alamat**: `@bgd-labs/aave-address-book` 4.44.22.
- **Parameter reserve**: `AaveProtocolDataProvider.getReserveConfigurationData` on-chain (RPC publicnode).
- **Oracle**: diuji langsung di Anvil fork Ethereum mainnet.

Item bertanda **[DISETUJUI]** mengubah keputusan sebelumnya; disetujui user 2026-10-27 dan sudah dimasukkan ke teks keputusannya.

### V1 — Event Pool (v3.7) ✓
- `Supply(reserve, user, onBehalfOf, amount, referralCode)`: `user` = pemanggil, `onBehalfOf` = penerima aToken.
- `Withdraw(reserve, user, to, amount)`: `user` = pemilik aToken yang ditarik.
- `Borrow(reserve, user, onBehalfOf, amount, interestRateMode, borrowRate, referralCode)`: `onBehalfOf` = yang berutang.
- `Repay(reserve, user, repayer, amount, useATokens)`: `user` = yang utangnya berkurang.
- `ReserveUsedAsCollateralEnabled/Disabled(reserve, user)`.
- `LiquidationCall(collateralAsset, debtAsset, user, debtToCover, liquidatedCollateralAmount, liquidator, receiveAToken)`.
- Event tambahan yang relevan: `UserEModeSet(user, categoryId)`, `DeficitCreated(user, debtAsset, amountCreated)`.

### V2 — Lewat WrappedTokenGateway **[DISETUJUI: #8, #11]**
| Aksi | Pemilik ada di | Catatan |
|---|---|---|
| `depositETH` | `Supply.onBehalfOf` ✓ | `Supply.user` = gateway |
| `borrowETH` | `Borrow.onBehalfOf` ✓ | `Borrow.user` = gateway |
| `repayETH` | `Repay.user` ✓ | `repayer` = gateway; kelebihan ETH di-refund otomatis |
| `withdrawETH` | **tidak ada di event `Withdraw`** ✗ | Gateway memindahkan aWETH user ke dirinya lalu `withdraw` atas namanya sendiri: `Withdraw.user` = `to` = gateway |
- Untuk withdraw ETH, pemilik hanya terlihat di event aWETH `Transfer(user → gateway, amount)`
  (jumlah asli) / `BalanceTransfer` (scaled) di tx yang sama.
- **Keputusan**: indexer juga mendengarkan `Transfer` aWETH yang tujuannya gateway, lalu
  memasangkannya dengan `Withdraw(user = gateway)` di tx yang sama. Tetap tanpa `txFrom`
  (sejalan dengan #11, dan tetap benar untuk smart wallet).
- `withdrawETH(amount = max)` memakai saldo aWETH saat eksekusi, yang terus bertambah karena
  bunga. Approve aWETH yang exact ke saldo saat ini akan **gagal** saat withdraw semua.
  **Keputusan**: untuk "withdraw semua", izin diberi bantalan seperti repay (#8).
  (`withdrawETHWithPermit` nggak dipakai; nilai permit juga butuh bantalan.)

### V3 — Event jaminan terpancar otomatis **[DISETUJUI: Q18]**
- `ReserveUsedAsCollateralEnabled` terpancar otomatis pada supply pertama sebuah aset.
- `ReserveUsedAsCollateralDisabled` terpancar otomatis saat saldo aToken habis (withdraw
  atau transfer semua) dan saat likuidasi menghabiskan jaminan.
- Penerima transfer aToken **tidak** otomatis diaktifkan jaminannya (v3.7), jadi gateway
  nggak pernah jadi "pemilik jaminan".
- **Keputusan**: di riwayat, event jaminan di tx yang sama dengan Supply/Withdraw/Likuidasi
  digabung ke baris itu (mis. "Supply 1 ETH · jaminan aktif"). Baris "Collateral" sendiri
  hanya untuk toggle manual.

### V4 — E-Mode di v3.7 **[DISETUJUI: #4, Q13; Q14 tetap]**
Aturan dari `GenericLogic`/`ValidationLogic`, untuk user di kategori E-Mode `k`:
- **LT**: aset di `collateralBitmap[k]` → LT kategori; aset lain → LT reserve biasa. Jadi
  catatan lama "semua pakai LT kategori" salah; yang benar per aset. (Rumus Q14 di prototype
  sudah memakai LT per aset, jadi tetap.)
- **LTV**: aset di `collateralBitmap[k]` → LTV kategori, atau **0** kalau aset itu ada di
  `ltvzeroBitmap[k]` (v3.6). Aset di luar bitmap → **0 kalau kategori `isolated`** (v3.7),
  selain itu LTV reserve biasa.
- **Boleh dipinjam**: kalau user di E-Mode, **hanya** `borrowableBitmap[k]` yang menentukan
  (flag `borrowingEnabled` reserve diabaikan). Di luar E-Mode, `borrowingEnabled`. Reserve
  frozen/paused/nonaktif tetap nggak bisa dipinjam di kedua kasus.
  → **#4 berubah**: daftar "Assets to borrow" = `borrowableBitmap` kalau user di E-Mode,
  selain itu `borrowingEnabled`; reserve frozen/paused disembunyikan.
- Data dibaca lewat `UiPoolDataProviderV3.getEModes()` (label, collateralBitmap,
  borrowableBitmap, ltvzeroBitmap, isolated) dan `getUserReservesData` (`userEmodeCategoryId`).
- **Label kategori di-soft-deprecate sejak v3.6** (`docs/3.6`: "We highly recommend updating
  the UI code ... rather than relying on the on-chain label"). Ini menyentuh teks Q13
  "E-Mode aktif: <nama kategori>". **Keputusan**: tampilkan nama dari isi kategori, mis.
  "E-Mode aktif · jaminan: ETH, wstETH · pinjaman: ETH"; label on-chain hanya di Detail.
- Batas pinjam (`ltvRoom`) harus pakai LTV efektif di atas, termasuk aturan `ltvzero` dan `isolated`.
- **Keputusan tiket 14 (2026-10-28): data E-Mode dibaca dari getter Pool v3.7, bukan `getEModes()`.**
  - `UiPoolDataProviderV3.getEModes()` yang ter-deploy di Ethereum, Base, dan Arbitrum masih struct bentuk v3.6:
    `ltv, liquidationThreshold, liquidationBonus, collateralBitmap, label, borrowableBitmap, ltvzeroBitmap`.
    Tanpa `isolated`, jadi decode dengan struct v3.7 gagal (catatan tiket 02).
  - Pool (`POOL_REVISION` 11) punya getter lengkap: `getEModeCategoryCollateralConfig`, `getEModeCategoryLabel`,
    `getEModeCategoryCollateralBitmap/BorrowableBitmap/LtvzeroBitmap`, dan `getIsEModeCategoryIsolated`. Hanya
    kategori user yang dibaca (`userEmodeCategoryId` ≠ 0), di blok yang sama dengan data lain.
  - Bit bitmap = id reserve dari `getReserveAddressById` (bukan urutan `getReservesData`; keduanya sama di blok
    pin karena belum ada reserve yang di-drop).
  - Aturan yang dipakai = `ValidationLogic.getUserReserveLtv` untuk semua pemakaian LTV: batas pinjam, jaminan
    otomatis saat supply pertama, boleh menyalakan jaminan, dan aturan ltv0. Plus LT kategori untuk aset di
    `collateralBitmap` (`GenericLogic`).
  - Saat dicek, semua kategori di ketiga chain `isolated = false`.
  - **"Bisa jadi jaminan"** (Pasar supply, dan switch jaminan di Supply Anda) = **LTV efektif ≠ 0**, bukan flag
    `usageAsCollateralEnabled` reserve. Alasannya: kontrak v3.7 hanya memakai `getUserReserveLtv(...) != 0`
    (`validateUseAsCollateral`), baik untuk jaminan otomatis saat supply pertama maupun `setUserUseReserveAsCollateral`.
    Flag UiPoolDataProvider itu cuma turunan konfigurasi reserve (LT ≠ 0) dan buta E-Mode. Akibatnya bisa salah dua
    arah: aset ber-LTV reserve 0 yang masuk `collateralBitmap` kategori user tetap bisa jadi jaminan, sedangkan aset
    di `ltvzeroBitmap` atau di luar bitmap kategori `isolated` tidak bisa.

### V5 — Likuidasi & penalti **[DISETUJUI: Q16]**
- `liquidatedCollateralAmount` = jaminan yang diterima **likuidator saja**, belum termasuk
  protocol fee. Protocol fee dikirim terpisah sebagai aToken `Transfer(borrower → treasury)`
  di tx yang sama.
- Total jaminan user yang hilang = `liquidatedCollateralAmount` + protocol fee.
- Bonus (penalti) yang dipakai: `liquidationBonus` kategori E-Mode kalau user di E-Mode **dan**
  aset jaminannya ada di `collateralBitmap`; selain itu bonus reserve. Penalti = total − total/bonus.
- `debtToCover` di event = utang yang **benar-benar** dilunasi (`actualDebtToLiquidate`).
- Kalau likuidasi menghabiskan seluruh jaminan, sisa utang dihapus sebagai bad debt
  (`DeficitCreated`) dan jaminan dinonaktifkan otomatis (V3).
- **Keputusan**: indexer menyimpan protocol fee dari `Transfer` aToken ke treasury (bukan hasil
  hitung), mendengarkan `DeficitCreated`, dan riwayat likuidasi menampilkan "sisa utang
  dihapus" kalau ada. HF sebelum likuidasi tetap dibaca di blok −1 (Q16).

### V6 — Alamat & aset per chain **[DISETUJUI: #3]**
| | Ethereum | Base | Arbitrum |
|---|---|---|---|
| Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| WrappedTokenGateway | `0xd01607c3C5eCABa394D8be377a08590149325722` | `0xa0d9C1E9E48Ca30c8d8C3B5D69FF5dc1f6DFfC24` | `0x5283BEcEd7ADF6D003225C13896E536f2D4264FF` |
| UiPoolDataProvider | `0x56b7A1012765C285afAC8b8F25C69Bf10ccfE978` | `0xb84A20e848baE3e13897934bB4e74E2225f4546B` | `0x13c833256BD767da2320d727a3691BAff3770E39` |
| AaveOracle | `0x54586bE62E3c3580375aE3723C145253060Ca0C2` | `0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156` | `0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7` |
| ACL_ADMIN (punya POOL_ADMIN) | `0x5300A1a15135EA4dc7aD5a167152C01EFc9b192A` | `0x9390B1735def18560c509E2d0bc090E9d6BA257a` | `0xFF1137243698CaA18EE364Cc966CF0e02A4e6327` |
| WETH | ✓ LTV 80,5% · LT 83% | ✓ 80% · 83% | ✓ 80% · 84% |
| USDC | ✓ native, 75% · 78% | ✓ native, 75% · 78% | **USDCn** (native) ✓ 75% · 78% |
| USDT | ✓ 75% · 78% | **✗ tidak ada di Aave Base** | ✓ 75% · 78% |
- Di address-book Arbitrum, konstanta `USDC` = **USDC.e (bridged)**, yang on-chain **frozen,
  LTV 0, borrowing off, reserve factor 75%** (sedang dikeluarkan). USDC native bernama `USDCn`.
- **Keputusan (#3)**: whitelist per chain berbasis **alamat**, bukan simbol: Ethereum
  WETH/USDC/USDT, Base WETH/USDC, Arbitrum WETH/USDCn/USDT. USDC.e dan USDbC (Base) hanya
  muncul sebagai aset luar (Q13) kalau user punya posisinya.
- Parameter memang beda per chain (mis. LT WETH Arbitrum 84% vs 83%), jadi #3 (jangan
  hardcode parameter) terbukti perlu.
- Catatan aset luar: jaminan ber-LTV 0 (mis. USDC.e) memicu aturan ltv0, sehingga user perlu
  menonaktifkan/menarik aset itu dulu sebelum menarik jaminan lain. Pesan error dari kontrak
  perlu diterjemahkan (pola `walletError` swap-web).

### V7 — Ubah harga oracle di fork ✓ (diuji)
Diuji di Anvil fork Ethereum mainnet:
1. Deploy mock aggregator (hanya `latestAnswer()`, 8 desimal; `AaveOracle.getAssetPrice`
   memang hanya memanggil `latestAnswer`).
2. `anvil_impersonateAccount(ACL_ADMIN)`. Akun ini punya `POOL_ADMIN`
   (`ACLManager.isPoolAdmin` = true di Ethereum dan Base).
3. `AaveOracle.setAssetSources([WETH], [mock])` berhasil. Harga WETH berubah $2.306 → $1.500.
4. Setelah itu cukup `mock.setAnswer(...)`. Harga berubah $1.500 → $1.200 tanpa admin lagi.
5. Akun biasa memanggil `setAssetSources` → revert (kode `5`, bukan admin).
Keputusan #10 tetap. Detail tambahan:
- **Akun dev Anvil #0, #1, #2 di Ethereum dan Base mainnet sudah punya delegasi EIP-7702**
  (`0xef0100…`). Swap-web baru membersihkan akun #0 (`anvil-up.mjs`). Lending perlu
  membersihkan **semua akun tes yang dipakai**, termasuk akun likuidator, lewat
  `anvil_setCode(akun, 0x)` saat fork dinyalakan.
- RPC publik (publicnode) menolak permintaan state lama ("archive"), jadi fork Base cepat
  rusak. Fork harus pakai RPC dengan archive (Alchemy, seperti mode fork swap-web).

### V8 — Kapasitas pool, withdraw, isolation mode (dicek 2026-10-27)
Sumber: `ValidationLogic`, `ReserveLogic`, `docs/3.7/mode-removal.md` (kode v3.7 yang sama).
- **Supply cap**: `(scaledTotalSupply aToken + amount + accruedToTreasury) × liquidityIndex
  ≤ supplyCap × 10^decimals`; `supplyCap = 0` = tanpa batas. Error `SupplyCapExceeded`.
- **Borrow cap**: `(total utang variabel + amount) ≤ borrowCap × 10^decimals`;
  `borrowCap = 0` = tanpa batas. Error `BorrowCapExceeded`.
- **Likuiditas**: borrow dan withdraw mengurangi `virtualUnderlyingBalance` reserve
  (tersedia di UiPoolDataProvider); jumlah di atasnya gagal.
- **Withdraw / matikan jaminan**: kontrak hanya mensyaratkan HF sesudah ≥ 1 (LT), plus
  aturan ltv0. Borrow mensyaratkan jaminan menutup utang sesuai LTV
  (`CollateralCannotCoverNewBorrow`). Aturan app #9 (dikunci kalau melewati batas LTV,
  juga untuk withdraw) **lebih ketat dari kontrak**, sengaja (Show the Risk).
- **Isolation mode & siloed borrowing dihapus di v3.7** (`mode-removal.md`): fungsi,
  event, dan error terkait dihapus; aset yang dulu ber-debt-ceiling sudah LTV 0; "No active
  isolated positions exist in production deployments". DataProvider masih mengembalikan
  nilai lama yang sudah nonaktif (`isolationModeTotalDebt` = 0, siloed = false).

## Catatan teknis untuk spec

Wajib masuk spec (`/to-spec`), bukan keputusan desain:
- **EIP-7702 di akun dev Anvil**: akun #0, #1, #2 di Ethereum dan Base mainnet sudah punya
  delegasi `0xef0100…` (V7). Saat fork dinyalakan, panggil `anvil_setCode(akun, 0x)` untuk
  **semua** akun tes yang dipakai: akun user tes **dan** akun likuidator Dev Tools (#10).
  Swap-web baru membersihkan akun #0 (`scripts/anvil-up.mjs`), jadi jangan disalin mentah.
- **Fork wajib pakai RPC archive** (Alchemy, seperti mode fork swap-web). RPC publik menolak
  permintaan state lama, dan fork Base rusak dalam hitungan menit (V7). Indexer juga butuh
  archive untuk HF sebelum likuidasi (Q16).
- Ubah harga oracle di Dev Tools: deploy mock aggregator → impersonate `ACL_ADMIN` →
  `AaveOracle.setAssetSources([aset], [mock])` → selanjutnya cukup `mock.setAnswer` (V7).
