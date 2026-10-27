// Semua teks UI di satu tempat, bahasa Indonesia baku dengan "Anda" (DECISIONS.md Q8).

export const PAGE = {
  brand: 'LENDEX',
  title: 'Lendex',
  description: 'Lending di atas Aave V3, semua chain dalam satu dashboard.',
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
  connectPrompt: 'Hubungkan wallet untuk melihat posisi Anda.',
};

// Pengaman fork (pola swap-web): kalau nggak aman, semua aksi transaksi dikunci.
export const FORK_GUARD = {
  checking: 'Memeriksa Anvil fork…',
  not_local_connector: `Mode fork hanya boleh memakai wallet "${WALLET.forkConnector}". Aksi transaksi dikunci.`,
  not_a_fork: 'RPC lokal bukan Anvil fork atau tidak bisa dihubungi. Jalankan `pnpm anvil:up`. Aksi transaksi dikunci.',
  fork_block_mismatch: 'Anvil berjalan di blok yang berbeda dari blok pin. Jalankan ulang `pnpm anvil:up`. Aksi transaksi dikunci.',
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
  retry: 'Coba lagi',
  liquidation: 'Harga likuidasi',
  liquidationInfo:
    'Harga ETH (oracle chain ini) yang membuat health factor tepat 1, dengan harga aset lain dianggap tetap. Bunga membuat angka ini terus bergeser.',
};

// Harga likuidasi (Q14, Q15): "saat ini" = harga oracle chain ini di blok yang dibaca.
export const LIQUIDATION = {
  price: (dir: 'turun' | 'naik', price: string, pct: string) => `Dilikuidasi kalau ETH ${dir} ke ${price} (${pct})`,
  now: 'Sudah bisa dilikuidasi sekarang',
  none: 'Tidak dipengaruhi harga ETH',
  mixed: 'Harga likuidasi tidak bisa dihitung untuk campuran aset ini, lihat Health factor',
  current: 'saat ini',
};

export const TABLE = {
  asset: 'Aset',
  apy: 'APY',
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
  repayFullEth: (debt: string, sent: string) =>
    `Lunas penuh: Aave menarik utang persis saat transaksi dijalankan (sekarang ${debt} ETH, terus bertambah oleh bunga). Anda mengirim ${sent} ETH; kelebihannya dikembalikan otomatis oleh gateway.`,
  withdrawAll: (amount: string, symbol: string) =>
    `Withdraw semua: seluruh ${symbol} ditarik saat transaksi dijalankan (sekarang ${amount} ${symbol}, termasuk bunga yang terus bertambah).`,
  collateralTitle: (symbol: string) => `Jaminan ${symbol}`,
  collateralOn: (symbol: string) =>
    `Saat ini ${symbol} dihitung sebagai jaminan. Kalau dimatikan, batas pinjam dan health factor ikut turun, tetapi ${symbol} tetap tersimpan dan tetap berbunga.`,
  collateralOff: (symbol: string) =>
    `${symbol} belum dihitung sebagai jaminan. Kalau diaktifkan, batas pinjam Anda naik, tetapi ${symbol} bisa ikut dijual saat likuidasi.`,
  noBorrowAssets: 'Tidak ada aset yang bisa dipinjam dari panel ini.',
  repayFull: (debt: string, symbol: string, cushion: string) =>
    `Lunas penuh: Aave menarik utang persis saat transaksi dijalankan (sekarang ${debt} ${symbol}, terus bertambah oleh bunga). Izin diberi bantalan bunga, total ${cushion} ${symbol}.`,
  arrow: '→',
  pendingAfter: '…',
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
  insufficientBalance: (symbol: string) => `Saldo ${symbol} tidak cukup`,
  needCollateral: 'Supply jaminan dulu',
  overLtv: 'Melebihi batas pinjam',
  collateralNeeded: 'Jaminan ini masih dibutuhkan',
  paused: 'Aset ini sedang Dijeda',
  ltvZero: 'Tarik jaminan ber-LTV 0 dulu',
  cannotBeCollateral: 'Aset ini tidak bisa jadi jaminan',
  confirmRisk: { check: 'Centang pernyataan risiko dulu', type: 'Ketik "confirm" dulu' },
  resetApproval: (symbol: string, action: string) => `Reset izin ${symbol}, lalu ${action}`,
  approve: (symbol: string, action: string) => `Approve ${symbol}, lalu ${action}`,
  supply: (amount: string, symbol: string) => `Supply ${amount} ${symbol}`,
  borrow: (amount: string, symbol: string) => `Borrow ${amount} ${symbol}`,
  repay: (amount: string, symbol: string) => `Repay ${amount} ${symbol}`,
  repayFull: (symbol: string) => `Lunasi utang ${symbol}`,
  withdraw: (amount: string, symbol: string) => `Withdraw ${amount} ${symbol}`,
  withdrawAll: (symbol: string) => `Withdraw semua ${symbol}`,
  setCollateral: (enable: boolean, symbol: string) => (enable ? `Aktifkan jaminan ${symbol}` : `Matikan jaminan ${symbol}`),
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
  legend: (symbol: string) => `Izin ${symbol} ke Aave Pool`,
  ariaMode: 'Jenis izin',
  exact: 'Exact',
  unlimited: 'Unlimited',
  exactNote: (amount: string, symbol: string) => `Hanya ${amount} ${symbol}. Paling aman; transaksi berikutnya perlu approve lagi.`,
  unlimitedWarning: (symbol: string) =>
    `Aave Pool boleh menarik ${symbol} berapa pun, tanpa batas waktu. Kalau izin ini disalahgunakan, seluruh saldo ${symbol} bisa ditarik.`,
  revoke: 'Periksa atau cabut izin di revoke.cash ↗',
};

// Langkah wallet sebelum popup (Q9): judul, penjelasan, alamat resmi, explorer.
export const STEPS = {
  heading: 'Yang akan diminta wallet',
  resetApproval: {
    title: (symbol: string) => `Reset izin ${symbol} ke 0`,
    detail: (symbol: string) =>
      `${symbol} menolak mengubah izin yang masih tersisa, jadi izin lama ke Aave Pool dinolkan dulu. Ada biaya jaringan.`,
  },
  approve: {
    title: (amount: string, symbol: string, unlimited: boolean) =>
      unlimited ? `Approve ${symbol} tanpa batas` : `Approve ${amount} ${symbol} (exact)`,
    detail: (amount: string, symbol: string, unlimited: boolean) =>
      unlimited
        ? `Mengizinkan Aave Pool menarik ${symbol} berapa pun. Ada biaya jaringan.`
        : `Mengizinkan Aave Pool menarik tepat ${amount} ${symbol}. Ada biaya jaringan.`,
  },
  supply: {
    title: (amount: string, symbol: string) => `Supply ${amount} ${symbol}`,
    detail: 'Transaksi utama ke Aave Pool. Ada biaya jaringan.',
    detailEth: 'ETH dikirim ke gateway resmi Aave, dibungkus jadi WETH, lalu di-supply atas nama Anda. Tanpa approve. Ada biaya jaringan.',
  },
  borrow: {
    title: (amount: string, symbol: string) => `Borrow ${amount} ${symbol}`,
    detail: 'Aave Pool mengirim pinjaman ke wallet Anda, dengan bunga variabel. Ada biaya jaringan.',
  },
  withdraw: {
    title: (amount: string, symbol: string) => `Withdraw ${amount} ${symbol}`,
    titleAll: (symbol: string) => `Withdraw semua ${symbol}`,
    detail: 'Aave Pool mengirim aset ke wallet Anda. Ada biaya jaringan.',
  },
  setCollateral: {
    title: (enable: boolean, symbol: string) => (enable ? `Aktifkan ${symbol} sebagai jaminan` : `Matikan ${symbol} sebagai jaminan`),
    detail: 'Mengubah status jaminan di Aave Pool; saldo Anda tidak berpindah. Ada biaya jaringan.',
  },
  repay: {
    title: (amount: string, symbol: string) => `Repay ${amount} ${symbol}`,
    titleFull: (symbol: string) => `Lunasi utang ${symbol}`,
    detail: 'Transaksi utama ke Aave Pool. Ada biaya jaringan.',
    detailEth: 'ETH dikirim ke gateway resmi Aave untuk melunasi utang Anda. Kelebihan ETH dikembalikan otomatis. Tanpa approve. Ada biaya jaringan.',
  },
  pool: 'Aave Pool',
  gateway: 'Aave WrappedTokenGateway',
  token: (symbol: string) => `Kontrak ${symbol}`,
  spender: 'Izin untuk Aave Pool',
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
  wrong_network: 'Wallet Anda sedang di network lain. Ganti ke Ethereum di wallet, lalu coba lagi.',
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
