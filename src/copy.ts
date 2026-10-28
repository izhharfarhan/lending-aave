// Semua teks UI di satu tempat, bahasa Indonesia baku dengan "Anda" (DECISIONS.md Q8).

export const PAGE = {
  brand: 'LENDEX',
  title: 'Lendex',
  description: 'Lending di atas Aave V3, semua chain dalam satu dashboard.',
};

// Pilih chain (Q5): cuma mengganti tampilan (`?chain=`), wallet baru diminta ganti network saat bertransaksi.
export const CHAIN_PICKER = {
  label: 'Pilih chain',
  switchRejected: (chain: string) => `Anda menolak ganti network. Wallet tetap di network lama; tekan "Ganti ke ${chain}" untuk mencoba lagi.`,
  switchFailed: (chain: string) => `Wallet tidak bisa pindah ke ${chain}. Ganti network langsung di wallet, lalu coba lagi.`,
};

export const NAV = {
  section: 'Umum',
  dashboard: 'Dashboard',
  history: 'Riwayat',
  emode: 'E-Mode',
  soon: 'SEGERA',
};

export const FORK = {
  badge: 'FORK MODE',
  note: 'Transaksi tidak menyentuh mainnet',
};

export const WALLET = {
  forkConnector: 'Anvil (fork lokal)',
  forkGroup: 'Fork lokal',
  walletGroup: 'Wallet',
  connect: 'Hubungkan wallet',
};

// Pengaman fork (pola swap-web): kalau nggak aman, semua aksi transaksi dikunci.
// Dicek per chain terpilih: Anvil satu chain mati cuma mengunci transaksi di chain itu.
export const FORK_GUARD = {
  checking: (chain: string) => `Memeriksa Anvil fork ${chain}…`,
  not_local_connector: () => `Mode fork hanya boleh memakai wallet "${WALLET.forkConnector}". Aksi transaksi dikunci.`,
  not_a_fork: (chain: string) =>
    `RPC lokal ${chain} bukan Anvil fork atau tidak bisa dihubungi. Jalankan \`pnpm anvil:up\`. Aksi transaksi di ${chain} dikunci.`,
  fork_block_mismatch: (chain: string) =>
    `Anvil ${chain} berjalan di blok yang berbeda dari blok pin. Jalankan ulang \`pnpm anvil:up\`. Aksi transaksi di ${chain} dikunci.`,
};

export const RISK = { aman: 'Aman', waspada: 'Waspada', bahaya: 'Bahaya' } as const;

export const POSITION = {
  healthFactor: 'Health factor',
  noDebt: 'Tidak ada utang',
  available: 'Sisa batas pinjam',
  used: 'Batas pinjam terpakai',
  /** Utang tersisa sementara semua jaminan ber-LTV 0. */
  overLimit: '> 100%',
  collateral: 'Total jaminan',
  debt: 'Total utang',
  hfInfo:
    'Health factor = nilai jaminan × liquidation threshold ÷ utang. Kalau turun di bawah 1, sebagian jaminan Anda dijual pihak lain untuk melunasi utang, ditambah penalti.',
  loading: 'Memuat posisi…',
  failed: (chain: string) => `Posisi di ${chain} gagal dimuat.`,
  /** Q4: chain yang gagal nggak ikut ringkasan di atas. */
  notCounted: 'Ringkasan semua chain di atas belum menghitung chain ini.',
  retry: 'Coba lagi',
  liquidation: 'Harga likuidasi',
  liquidationInfo:
    'Harga ETH (oracle chain ini) yang membuat health factor tepat 1, dengan harga aset lain dianggap tetap. Bunga membuat angka ini terus bergeser.',
};

// Dashboard semua chain (ADR 0001, Q2, Q3, Q10, Q21, Q24).
export const DASHBOARD = {
  lowestHf: 'Health factor terendah · semua chain',
  lowestHfInfo: `${POSITION.hfInfo} Dihitung dari chain yang punya utang.`,
  /** Skala HF 1,0 → 3,0+ (Q20); HF di atas 3 menempel di ujung kanan. */
  scaleTicks: [
    [1, '1,0'],
    [1.5, '1,5'],
    [2, '2,0'],
    [3, '3,0+'],
  ] as [number, string][],
  liquidationTick: 'likuidasi',
  marker: (chain: string, hf: string) => `${chain}, health factor ${hf}`,
  /** Pemisah label penanda yang digabung karena HF-nya berdekatan. */
  markerJoin: ' · ',
  totalSupply: 'Total supply',
  totalDebt: 'Total utang',
  net: 'Net',
  limitUsed: 'Batas pinjam terpakai · tertinggi:',
  limitInfo:
    'Batas pinjam berlaku per chain: jaminan di Ethereum tidak bisa menutup utang di Base. Yang ditampilkan chain yang paling dekat batasnya; pemakaian tiap chain ada di garis tipis pada segmen chain.',
  remaining: 'sisa',
  supplyDebt: (supply: string, debt: string) => `${supply} supply · ${debt} utang`,
  noPosition: 'Belum ada posisi',
  canSupply: (amount: string) => `${amount} di wallet bisa di-supply`,
  ethShort: 'ETH kurang untuk bertransaksi',
  noDebt: POSITION.noDebt,
  retry: POSITION.retry,
  retrying: 'Memuat…',
  // Q4, Q24: ringkasan nggak pernah tampil lengkap kalau ada chain yang gagal dibaca.
  incomplete: (read: number, total: number) => `Belum lengkap (${read}/${total} chain)`,
  atMost: '≤',
  unknownHf: '—',
  hfMayBeLower: (chains: string) => `${chains} belum terbaca, bisa lebih rendah`,
  /** Chain yang terbaca tanpa utang: belum ada angka yang bisa "lebih rendah". */
  mayHaveDebt: (chains: string) => `${chains} belum terbaca, bisa saja ada utang`,
  limitMayBeHigher: (chains: string) => `${chains} belum terbaca, bisa saja lebih tinggi`,
  // Q6: sebelum wallet terhubung.
  connectPrompt: (chains: string) => `Hubungkan wallet untuk melihat posisi Anda di ${chains} sekaligus.`,
  connect: WALLET.connect,
  /** Segmen chain sebelum connect: keterangan, bukan tombol (klik segmen tetap memilih chain). */
  connectSegment: 'Posisi tampil setelah wallet terhubung',
  failed: 'Gagal dimuat',
};

// Umur relatif ("2 menit"), dipakai dengan "… lalu".
export const AGE = {
  second: (n: number) => (n < 10 ? 'beberapa detik' : `${n} detik`),
  minute: (n: number) => `${n} menit`,
  hour: (n: number) => `${n} jam`,
  day: (n: number) => `${n} hari`,
};

// Banner Bahaya di atas hero (Q2): chain HF terendah dulu, sisanya "+N chain lain".
export const DANGER = {
  tag: 'BAHAYA',
  hf: (chain: string) => `Health factor ${chain}`,
  more: (n: number) => `+${n} chain lain.`,
  view: (chain: string) => `Lihat ${chain} →`,
  /** Klarifikasi Q4: chain yang bacaan terakhirnya gagal tetap di banner dari data terakhir yang berhasil. */
  stale: (age: string) => `(data ${age} lalu, belum bisa diperbarui)`,
};

// Panel penyelamatan (Q29, J3): dibuka dari "Lihat <chain>" di banner Bahaya.
export const RESCUE = {
  title: (chain: string) => `Selamatkan posisi ${chain}`,
  intro: 'Dua cara menaikkan Health factor. Angkanya memakai jumlah terbesar yang bisa Anda jalankan sekarang; jumlah sebenarnya Anda isi sendiri.',
  now: 'Health factor sekarang',
  repayNote: 'Kurangi utang dari saldo wallet',
  supply: 'Supply jaminan',
  supplyNote: 'Tambah jaminan dari saldo wallet',
  using: (amount: string, symbol: string) => `MAX ${amount} ${symbol}`,
  hfAfter: 'Health factor sesudah',
  /** Tanpa pilihan: saldo wallet kosong, reserve Dijeda, atau aksinya nggak menaikkan Health factor. */
  noRepay: (chain: string) => `Belum ada saldo di wallet Anda (${chain}) yang bisa dipakai repay untuk menaikkan Health factor.`,
  noSupply: (chain: string) => `Belum ada saldo di wallet Anda (${chain}) yang bisa jadi jaminan untuk menaikkan Health factor.`,
  choose: (action: string) => `Pilih ${action}`,
};

// Harga likuidasi (Q14, Q15): "saat ini" = harga oracle chain ini di blok yang dibaca.
export const LIQUIDATION = {
  price: (dir: 'turun' | 'naik', price: string, pct: string) => `Dilikuidasi kalau ETH ${dir} ke ${price} (${pct})`,
  now: 'Sudah bisa dilikuidasi sekarang',
  none: 'Tidak dipengaruhi harga ETH',
  mixed: 'Harga likuidasi tidak bisa dihitung untuk campuran aset ini, lihat Health factor',
  current: 'saat ini',
};

// E-Mode read-only (Q13, V4): diatur di app.aave.com; nama dari isi kategori, label on-chain cuma di "Detail parameter".
export const E_MODE = {
  active: 'E-Mode aktif',
  collateral: (assets: string) => `jaminan: ${assets}`,
  borrowable: (assets: string) => `pinjaman: ${assets}`,
  none: 'tidak ada',
  managed: 'diatur di',
};

// Istilah asli Aave tetap dipakai, dengan penjelasan sederhana di ⓘ (Q8).
export const TERMS = {
  apy: 'APY (annual percentage yield): bunga per tahun, sudah termasuk bunga atas bunga. Angkanya ikut berubah mengikuti pemakaian pool.',
  ltv: 'LTV (loan to value): bagian nilai jaminan ini yang boleh Anda pinjam. LTV 80% = jaminan $100 memberi batas pinjam $80.',
  liquidationThreshold:
    'Liquidation threshold: kalau utang melewati bagian nilai jaminan sebesar ini, Health factor turun di bawah 1 dan posisi bisa dilikuidasi.',
  liquidationPenalty: 'Liquidation penalty: jaminan tambahan yang diambil likuidator saat posisi dilikuidasi, di atas utang yang dilunasinya.',
  utilization: 'Utilization: bagian likuiditas pool yang sedang dipinjam. Makin tinggi, makin tinggi bunganya dan makin sedikit yang bisa ditarik.',
  reserveFactor: 'Reserve factor: bagian bunga pinjaman yang masuk ke kas Aave, bukan ke pemberi supply.',
  supplyCap: 'Supply cap (kuota supply): batas total supply aset ini di pool.',
  borrowCap: 'Borrow cap (kuota pinjaman): batas total pinjaman aset ini di pool.',
  oracle: 'Harga oracle: harga yang dipakai Aave untuk menghitung jaminan, utang, dan Health factor.',
};

// "Detail parameter <chain>" (Q7): angka lengkap untuk user pro, tertutup di tampilan awal.
export const DETAIL = {
  title: (chain: string) => `Detail parameter ${chain}`,
  ltv: 'LTV',
  liquidationThreshold: 'Liquidation threshold',
  liquidationPenalty: 'Liquidation penalty',
  utilization: 'Utilization',
  reserveFactor: 'Reserve factor',
  supplyCap: 'Supply cap',
  borrowCap: 'Borrow cap',
  oracle: 'Harga oracle',
  addresses: 'Alamat',
  reserve: 'reserve ↗',
  aToken: 'aToken ↗',
  noCap: 'Tanpa batas',
  eMode: (label: string) => `E-Mode Anda: kategori "${label}" (label on-chain).`,
  eModeNote: 'LTV dan liquidation threshold di tabel adalah nilai reserve; untuk jaminan di kategori E-Mode Anda, nilai kategorinya yang berlaku.',
};

export const TABLE = {
  asset: 'Aset',
  apy: 'Bunga per tahun',
  balance: 'Saldo',
  collateral: 'Jaminan',
  debt: 'Utang',
  wallet: 'Wallet',
  canBorrow: 'Bisa Anda pinjam',
  supplies: 'Supply Anda',
  borrows: 'Utang Anda',
  supplyMarket: 'Pasar supply',
  borrowMarket: 'Pasar pinjam',
  showAll: 'Tampilkan semua',
  showAllLabel: 'Tampilkan semua aset',
  collateralOn: 'aktif',
  collateralYes: '✓ bisa',
  none: '—',
  noSupplies: 'Belum ada supply di chain ini.',
  noBorrows: 'Belum ada utang di chain ini.',
  emptyWallet: 'Tidak ada aset bersaldo di wallet. Nyalakan "Tampilkan semua".',
  emptyMarket: 'Tidak ada aset yang ditawarkan saat ini.',
  outside: 'aset luar · dikelola di',
  aaveApp: 'app.aave.com ↗',
  dibekukan: 'Dibekukan',
  dijeda: 'Dijeda',
  /** Penjelasan di samping label (spec 49–50). */
  dibekukanNote: 'supply & borrow baru ditutup; withdraw dan repay tetap bisa',
  dijedaNote: 'semua aksi nonaktif sementara oleh Aave',
};

export const PANEL = {
  tabs: { supply: 'Supply', withdraw: 'Withdraw', borrow: 'Borrow', repay: 'Repay' },
  soon: 'Menyusul',
  amount: 'Jumlah',
  max: 'MAX',
  maxInfo: 'Isi jumlah terbesar yang bisa dijalankan: saldo, batas LTV, kapasitas pool, dan cadangan gas untuk ETH.',
  asset: 'Aset',
  wallet: 'Wallet',
  interest: (usdPerYear: string, apy: string) => `bunga ≈ ${usdPerYear} per tahun (APY ${apy})`,
  borrowInterest: (usdPerYear: string, apy: string) => `bunga pinjaman ≈ ${usdPerYear} per tahun (APY ${apy})`,
  debt: 'Utang',
  supplied: 'Di-supply',
  collateralOf: (chain: string) => `Jaminan Anda di ${chain}:`,
  noCollateral: 'belum ada',
  changeCollateral: 'Ubah',
  noDebts: 'Tidak ada utang yang bisa dilunasi dari panel ini.',
  noSupplies: 'Tidak ada supply yang bisa ditarik dari panel ini.',
  noSupplyAssets: 'Tidak ada aset yang bisa di-supply dari panel ini.',
  /** Per jalur (`pool` = ERC20 langsung ke Pool, `gateway` = ETH lewat WrappedTokenGateway); `cushion` = utang + bantalan. */
  repayFull: {
    pool: (debt: string, symbol: string, cushion: string) =>
      `Lunas penuh: Aave menarik utang persis saat transaksi dijalankan (sekarang ${debt} ${symbol}, terus bertambah oleh bunga). Izin diberi bantalan bunga, total ${cushion} ${symbol}.`,
    gateway: (debt: string, _symbol: string, cushion: string) =>
      `Lunas penuh: Aave menarik utang persis saat transaksi dijalankan (sekarang ${debt} ETH, terus bertambah oleh bunga). Anda mengirim ${cushion} ETH; kelebihannya dikembalikan otomatis oleh gateway.`,
  },
  /** `cushion` = saldo + bantalan bunga, jumlah izin aWETH (cuma jalur gateway). */
  withdrawAll: {
    pool: (amount: string, symbol: string, _cushion: string) =>
      `Withdraw semua: seluruh ${symbol} ditarik saat transaksi dijalankan (sekarang ${amount} ${symbol}, termasuk bunga yang terus bertambah).`,
    gateway: (amount: string, _symbol: string, cushion: string) =>
      `Withdraw semua: seluruh ETH ditarik saat transaksi dijalankan (sekarang ${amount} ETH, termasuk bunga yang terus bertambah). Izin aWETH diberi bantalan bunga, total ${cushion} aWETH.`,
  },
  collateralTitle: (symbol: string) => `Jaminan ${symbol}`,
  collateralOn: (symbol: string) =>
    `Saat ini ${symbol} dihitung sebagai jaminan. Kalau dimatikan, batas pinjam dan health factor ikut turun, tetapi ${symbol} tetap tersimpan dan tetap berbunga.`,
  collateralOff: (symbol: string) =>
    `${symbol} belum dihitung sebagai jaminan. Kalau diaktifkan, batas pinjam Anda naik, tetapi ${symbol} bisa ikut dijual saat likuidasi.`,
  noBorrowAssets: 'Tidak ada aset yang bisa dipinjam dari panel ini.',
  arrow: '→',
  pendingAfter: '…',
  networkFee: 'Biaya jaringan',
  networkFeeValue: (eth: string) => `~${eth} ETH`,
  networkFeePending: 'Menghitung…',
  networkFeeFailed: 'Tidak dapat diperkirakan',
  networkFeeInfo: 'Perkiraan biaya semua transaksi yang tersisa (izin + transaksi utama), dibayar dengan ETH di chain ini.',
  invalid: {
    not_a_number: 'Jumlah tidak valid.',
    too_many_decimals: (decimals: number) => `Maksimal ${decimals} angka di belakang koma.`,
    overflow: 'Jumlah terlalu besar.',
  },
};

export const CTA = {
  connect: 'Hubungkan wallet',
  loading: POSITION.loading,
  loadFailed: 'Posisi gagal dimuat',
  locked: 'Transaksi dikunci (pengaman fork)',
  busy: 'Sedang diproses…',
  enterAmount: 'Masukkan jumlah',
  needsEthForGas: 'ETH kurang untuk biaya jaringan',
  switchChain: (chain: string) => `Ganti ke ${chain}`,
  /** Q27; kuota yang masih tersisa sebagian ditulis jumlahnya, bukan "penuh". */
  overCapacity: {
    supplyCap: (available: string, symbol: string) =>
      available === '0' ? 'Kuota supply aset ini penuh' : `Melebihi sisa kuota supply, tersisa ${available} ${symbol}`,
    borrowCap: (available: string, symbol: string) =>
      available === '0' ? 'Kuota pinjaman aset ini penuh' : `Melebihi sisa kuota pinjaman, tersisa ${available} ${symbol}`,
    liquidity: (available: string, symbol: string) => `Likuiditas pool tidak cukup, tersedia ${available} ${symbol}`,
  },
  insufficientBalance: (symbol: string) => `Saldo ${symbol} tidak cukup`,
  needCollateral: 'Supply jaminan dulu',
  overLtv: 'Melebihi batas pinjam',
  collateralNeeded: 'Jaminan ini masih dibutuhkan',
  paused: 'Aset ini sedang Dijeda',
  ltvZero: 'Tarik jaminan ber-LTV 0 dulu',
  cannotBeCollateral: 'Aset ini tidak bisa jadi jaminan',
  confirmRisk: { check: 'Centang pernyataan risiko dulu', type: 'Ketik "confirm" dulu' },
  resetApproval: (symbol: string, action: string) => `Reset izin ${symbol}, lalu ${action}`,
  supply: (amount: string, symbol: string) => `Supply ${amount} ${symbol}`,
  borrow: (amount: string, symbol: string) => `Borrow ${amount} ${symbol}`,
  repay: (amount: string, symbol: string) => `Repay ${amount} ${symbol}`,
  repayFull: (symbol: string) => `Lunasi utang ${symbol}`,
  withdraw: (amount: string, symbol: string) => `Withdraw ${amount} ${symbol}`,
  withdrawAll: (symbol: string) => `Withdraw semua ${symbol}`,
  setCollateral: (enable: boolean, symbol: string) => (enable ? `Aktifkan jaminan ${symbol}` : `Matikan jaminan ${symbol}`),
};

// ETH kurang untuk biaya jaringan (spec 85–86, DECISIONS.md Q10).
export const GAS = {
  needed: (needed: string, balance: string) => `Perkiraan ETH yang dibutuhkan ~${needed} ETH; saldo ETH Anda ${balance} ETH.`,
  empty: (chain: string) => `Wallet ini tidak punya ETH di ${chain}. Setiap transaksi, termasuk approve, dibayar dengan ETH.`,
  howTo: 'Cara mendapatkan ETH',
};

// Halaman bantuan "Cara mendapatkan ETH" (spec 86).
export const GET_ETH = {
  title: 'Cara mendapatkan ETH',
  back: '← Kembali ke dashboard',
  intro:
    'Setiap transaksi di Aave (approve, supply, borrow, repay, withdraw, dan mengubah jaminan) dibayar dengan ETH di chain tempat transaksi itu dijalankan. Di Ethereum, Base, dan Arbitrum, biaya jaringannya sama-sama dibayar dengan ETH.',
  sections: [
    {
      title: 'Beli di exchange',
      body: 'Beli ETH di exchange kripto yang Anda percaya, lalu tarik ke alamat wallet Anda. Saat menarik, pilih jaringan yang sama dengan chain yang ingin Anda pakai (Ethereum, Base, atau Arbitrum). Jaringan yang salah bisa membuat ETH tidak sampai.',
    },
    {
      title: 'Pindahkan lewat bridge resmi',
      body: 'Kalau Anda sudah punya ETH di chain lain, pindahkan lewat bridge resmi: Arbitrum Bridge (bridge.arbitrum.io) untuk Arbitrum, atau bridge yang tercantum di dokumentasi resmi Base (docs.base.org) untuk Base. Periksa alamat situsnya sebelum menghubungkan wallet.',
    },
  ],
  fork: 'Mode fork: ETH di sini bukan ETH asli. Isi saldo ETH lewat faucet di Dev Tools.',
};

// Konfirmasi risiko #9 sesuai HF sesudah aksi.
export const RISK_CONFIRM = {
  warn: (hf: string) => `Health factor sesudahnya ${hf}, Waspada. Harga jaminan yang turun sedikit saja bisa membuat posisi ini berbahaya.`,
  /** `liquidation` = kalimat harga likuidasi, atau kosong kalau posisinya nggak punya angka harga likuidasi. */
  check: (hf: string, liquidation: string) =>
    `Health factor sesudahnya ${hf}, Bahaya. ${liquidation ? `${liquidation}. ` : ''}Saya memahami risikonya.`,
  type: (hf: string) =>
    `Health factor sesudahnya ${hf}, sangat dekat dengan 1. Penurunan harga kecil saja bisa membuat jaminan Anda dilikuidasi. Ketik "confirm" jika tetap ingin melanjutkan.`,
  typePlaceholder: 'Ketik "confirm"',
  typeLabel: 'Konfirmasi risiko',
  word: 'confirm',
  locked: 'Jumlah ini melebihi batas pinjam (LTV). Kurangi jumlahnya atau tambah jaminan.',
  // V8: withdraw & mematikan jaminan dikunci di batas LTV, lebih ketat dari kontrak (yang cuma mensyaratkan HF ≥ 1).
  lockedWithdraw: 'Sisa jaminan sesudah withdraw ini tidak cukup untuk utang Anda (melewati batas LTV). Kurangi jumlahnya atau lunasi sebagian utang dulu.',
  lockedCollateral: (symbol: string, chain: string) =>
    `Utang Anda di ${chain} masih memakai ${symbol} sebagai jaminan. Lunasi sebagian utang dulu.`,
  /** `assets` = jaminan ber-LTV 0 milik user; `elsewhere` = semuanya aset luar (cuma bisa diatur di app.aave.com). */
  ltvZero: (assets: string, elsewhere: boolean) =>
    `Anda punya jaminan ber-LTV 0 (sudah tidak bisa dipakai untuk meminjam): ${assets}. Selama jaminan itu masih aktif, Aave menolak withdraw atau mematikan jaminan lain. Tarik atau matikan ${assets} dulu${elsewhere ? ' di app.aave.com' : ''}.`,
  paused: 'Aave sedang menjeda aset ini: withdraw, repay, dan toggle jaminan nonaktif sementara. Posisi Anda tetap tersimpan dan tetap dihitung di health factor.',
  cannotBeCollateral: (symbol: string) => `${symbol} tidak bisa dijadikan jaminan di Aave (LTV 0).`,
};

// Approve default exact; unlimited hanya pilihan eksplisit user (#8, pola Q7 swap).
export const APPROVAL = {
  ariaMode: 'Jenis izin',
  exact: 'Exact',
  unlimited: 'Unlimited',
  revoke: 'Periksa atau cabut izin di revoke.cash ↗',
};

/**
 * Izin sebelum transaksi utama, per jenis (spec 13): `pool` = ERC20 ke Aave Pool (supply/repay ERC20), `aWeth` = aWETH ke
 * WrappedTokenGateway (withdraw ETH), `delegation` = gateway boleh berutang atas nama user (borrow ETH). Judul dan
 * penjelasan langkah wallet, tombol utama, dan pengaturan exact/unlimited semuanya dari sini.
 */
export const GRANT = {
  pool: {
    cta: (symbol: string, action: string) => `Approve ${symbol}, lalu ${action}`,
    title: (amount: string, symbol: string, unlimited: boolean) =>
      unlimited ? `Approve ${symbol} tanpa batas` : `Approve ${amount} ${symbol} (exact)`,
    detail: (amount: string, symbol: string, unlimited: boolean) =>
      unlimited
        ? `Mengizinkan Aave Pool menarik ${symbol} berapa pun. Ada biaya jaringan.`
        : `Mengizinkan Aave Pool menarik tepat ${amount} ${symbol}. Ada biaya jaringan.`,
    legend: (symbol: string) => `Izin ${symbol} ke Aave Pool`,
    exactNote: (amount: string, symbol: string) => `Hanya ${amount} ${symbol}. Paling aman; transaksi berikutnya perlu approve lagi.`,
    unlimitedWarning: (symbol: string) =>
      `Aave Pool boleh menarik ${symbol} berapa pun, tanpa batas waktu. Kalau izin ini disalahgunakan, seluruh saldo ${symbol} bisa ditarik.`,
    revocable: true,
  },
  aWeth: {
    cta: (_symbol: string, action: string) => `Approve aWETH, lalu ${action}`,
    title: (amount: string, _symbol: string, unlimited: boolean) =>
      unlimited ? 'Approve aWETH ke WrappedTokenGateway tanpa batas' : `Approve ${amount} aWETH ke WrappedTokenGateway (exact)`,
    detail: (amount: string, _symbol: string, unlimited: boolean) =>
      `aWETH adalah bukti supply ETH Anda. Untuk withdraw ETH, gateway resmi Aave menarik aWETH dari wallet Anda, menukarnya jadi ETH, lalu mengirimkannya ke Anda; izin ini membolehkan gateway menarik ${unlimited ? 'aWETH berapa pun' : `tepat ${amount} aWETH`}. Ada biaya jaringan.`,
    legend: () => 'Izin aWETH ke Aave WrappedTokenGateway',
    exactNote: (amount: string) => `Hanya ${amount} aWETH. Paling aman; withdraw ETH berikutnya perlu approve lagi.`,
    unlimitedWarning: () =>
      'Gateway boleh menarik aWETH berapa pun, tanpa batas waktu. Kalau izin ini disalahgunakan, seluruh supply ETH Anda bisa ditarik.',
    revocable: true,
  },
  delegation: {
    cta: (_symbol: string, action: string) => `Izinkan gateway berutang, lalu ${action}`,
    title: (amount: string) => `Izinkan gateway berutang ${amount} ETH atas nama Anda`,
    detail: (amount: string) =>
      `Credit delegation: Aave meminjamkan WETH ke gateway resmi Aave, tetapi utangnya dicatat atas nama Anda. Gateway membukanya jadi ETH lalu mengirimkannya ke wallet Anda. Izin ini membolehkan gateway berutang paling banyak ${amount} ETH atas nama Anda. Ada biaya jaringan.`,
    legend: () => 'Izin berutang ETH untuk Aave WrappedTokenGateway',
    exactNote: (amount: string) => `Tepat ${amount} ETH. Izin ini habis terpakai otomatis setelah pinjam; borrow ETH berikutnya minta izin lagi.`,
    // Tanpa pilihan Unlimited: delegation terbuka = pihak lain bisa berutang atas nama Anda (keputusan tiket 07).
    unlimitedWarning: null,
    // Credit delegation bukan allowance ERC20 biasa; revoke.cash belum tentu menampilkannya.
    revocable: false,
  },
};

// Langkah wallet sebelum popup (Q9): judul, penjelasan, alamat resmi, explorer.
export const STEPS = {
  heading: 'Yang akan diminta wallet',
  resetApproval: {
    title: (symbol: string) => `Reset izin ${symbol} ke 0`,
    detail: (symbol: string) =>
      `${symbol} menolak mengubah izin yang masih tersisa, jadi izin lama ke Aave Pool dinolkan dulu. Ada biaya jaringan.`,
  },
  // `detail` per jalur: `pool` = ERC20 langsung ke Aave Pool, `gateway` = ETH lewat WrappedTokenGateway.
  supply: {
    title: (amount: string, symbol: string) => `Supply ${amount} ${symbol}`,
    detail: {
      pool: 'Transaksi utama ke Aave Pool. Ada biaya jaringan.',
      gateway: 'ETH dikirim ke gateway resmi Aave, dibungkus jadi WETH, lalu di-supply atas nama Anda. Tanpa approve. Ada biaya jaringan.',
    },
  },
  borrow: {
    title: (amount: string, symbol: string) => `Borrow ${amount} ${symbol}`,
    detail: {
      pool: 'Aave Pool mengirim pinjaman ke wallet Anda, dengan bunga variabel. Ada biaya jaringan.',
      gateway: 'Gateway resmi Aave meminjam WETH atas nama Anda (bunga variabel), membukanya jadi ETH, lalu mengirimkannya ke wallet Anda. Ada biaya jaringan.',
    },
  },
  withdraw: {
    title: (amount: string, symbol: string) => `Withdraw ${amount} ${symbol}`,
    titleAll: (symbol: string) => `Withdraw semua ${symbol}`,
    detail: {
      pool: 'Aave Pool mengirim aset ke wallet Anda. Ada biaya jaringan.',
      gateway: 'Gateway resmi Aave menarik aWETH Anda, menukarnya jadi ETH, lalu mengirimkannya ke wallet Anda. Ada biaya jaringan.',
    },
  },
  setCollateral: {
    title: (enable: boolean, symbol: string) => (enable ? `Aktifkan ${symbol} sebagai jaminan` : `Matikan ${symbol} sebagai jaminan`),
    detail: 'Mengubah status jaminan di Aave Pool; saldo Anda tidak berpindah. Ada biaya jaringan.',
  },
  repay: {
    title: (amount: string, symbol: string) => `Repay ${amount} ${symbol}`,
    titleFull: (symbol: string) => `Lunasi utang ${symbol}`,
    detail: {
      pool: 'Transaksi utama ke Aave Pool. Ada biaya jaringan.',
      gateway: 'ETH dikirim ke gateway resmi Aave untuk melunasi utang Anda. Kelebihan ETH dikembalikan otomatis. Tanpa approve. Ada biaya jaringan.',
    },
  },
  pool: 'Aave Pool',
  gateway: 'Aave WrappedTokenGateway',
  token: (symbol: string) => `Kontrak ${symbol}`,
  spender: (name: string) => `Izin untuk ${name}`,
  aWeth: 'Kontrak aWETH',
  debtToken: 'Kontrak utang ETH (variableDebtWETH)',
  official: '✓ alamat resmi Aave',
  explorer: 'explorer ↗',
  smartAccountNote:
    'Wallet mungkin menawarkan "smart account activation" atau gas gratis. Itu fitur wallet, bukan bagian app ini, dan aman ditolak. Jika wallet menandai alamat di atas berbahaya, cocokkan lewat tautan explorer.',
  closeNote: 'Tutup catatan',
};

export const TX = {
  pending: 'menunggu',
  waitingWallet: 'konfirmasi di wallet…',
  waitingNetwork: 'menunggu jaringan…',
  done: '✓ selesai',
  rejectedStep: 'ditolak di wallet',
  failedStep: 'gagal',
  success: {
    supply: (amount: string, symbol: string) => `Supply ${amount} ${symbol} berhasil, posisi sudah diperbarui.`,
    borrow: (amount: string, symbol: string) => `Borrow ${amount} ${symbol} berhasil, posisi sudah diperbarui.`,
    repay: (amount: string, symbol: string) => `Repay ${amount} ${symbol} berhasil, posisi sudah diperbarui.`,
    withdraw: (amount: string, symbol: string) => `Withdraw ${amount} ${symbol} berhasil, posisi sudah diperbarui.`,
    collateralOn: (_amount: string, symbol: string) => `${symbol} sekarang dihitung sebagai jaminan.`,
    collateralOff: (_amount: string, symbol: string) => `${symbol} tidak lagi dihitung sebagai jaminan.`,
  },
  explorer: 'explorer ↗',
  forkTx: 'tx fork lokal, tidak ada di explorer publik',
  retry: 'Coba lagi',
};

// Error wallet & kontrak dalam bahasa yang bisa dipahami (spec 100–101, pola walletError swap-web).
export const TX_ERROR = {
  rejected: 'Anda menolak permintaan di wallet. Tidak ada biaya terpakai.',
  wrong_network: 'Wallet Anda sedang di network lain. Ganti network di wallet, lalu coba lagi.',
  insufficient_funds: 'ETH di wallet tidak cukup untuk biaya jaringan.',
  failed: 'Transaksi tidak terkirim. Posisi Anda tidak berubah.',
  reverted: 'Transaksi gagal di jaringan. Posisi Anda tidak berubah, tetapi biaya jaringan tetap terpakai.',
  aave: {
    SupplyCapExceeded: 'Kuota supply aset ini penuh.',
    ReserveFrozen: 'Aset ini sedang Dibekukan: supply baru tidak diterima.',
    ReservePaused: 'Aset ini sedang Dijeda: semua aksi nonaktif sementara.',
    ReserveInactive: 'Aset ini tidak aktif di Aave.',
    InvalidAmount: 'Jumlah harus lebih dari 0.',
    BorrowingNotEnabled: 'Aset ini tidak bisa dipinjam.',
    BorrowCapExceeded: 'Kuota pinjaman aset ini penuh.',
    CollateralCannotCoverNewBorrow: 'Jaminan Anda tidak cukup untuk pinjaman ini. Kurangi jumlahnya atau tambah jaminan.',
    HealthFactorLowerThanLiquidationThreshold: 'Pinjaman ini membuat health factor di bawah 1. Kurangi jumlahnya atau tambah jaminan.',
    LtvValidationFailed:
      'Ditolak aturan LTV Aave: jaminan Anda tidak bisa dipakai untuk aksi ini (LTV 0). Kalau Anda punya jaminan ber-LTV 0 (mis. USDC.e), tarik atau matikan jaminan itu dulu.',
    NoDebtOfSelectedType: 'Tidak ada utang aset ini yang bisa dilunasi.',
    NotEnoughAvailableUserBalance: 'Saldo supply Anda tidak cukup untuk jumlah ini.',
    UnderlyingBalanceZero: 'Supply aset ini dulu sebelum menjadikannya jaminan.',
    UserHasAssetWithZeroLtv: 'Aset ini tidak bisa dijadikan jaminan (LTV 0).',
  } as Record<string, string>,
};
