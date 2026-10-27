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
};
