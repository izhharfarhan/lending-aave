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
  ethBalance: 'Saldo ETH',
  connectPrompt: 'Hubungkan wallet untuk melihat posisi Anda.',
};

// Pengaman fork (pola swap-web): kalau nggak aman, semua aksi transaksi dikunci.
export const FORK_GUARD = {
  checking: 'Memeriksa Anvil fork…',
  not_local_connector: `Mode fork hanya boleh memakai wallet "${WALLET.forkConnector}". Aksi transaksi dikunci.`,
  not_a_fork: 'RPC lokal bukan Anvil fork atau tidak bisa dihubungi. Jalankan `pnpm anvil:up`. Aksi transaksi dikunci.',
  fork_block_mismatch: 'Anvil berjalan di blok yang berbeda dari blok pin. Jalankan ulang `pnpm anvil:up`. Aksi transaksi dikunci.',
};
