import type { Wallet } from '@rainbow-me/rainbowkit';
import { createConnector } from 'wagmi';
import { mock } from 'wagmi/connectors';

import { TEST_ACCOUNTS } from '@/config/fork';
import { WALLET } from '@/copy';

export const FORK_CONNECTOR_ID = 'anvilFork';

// Ikon kuning hazard (sama dengan --hazard di globals.css), bukan amber Waspada. Data-URI SVG nggak bisa baca var CSS,
// jadi nilainya ditulis langsung.
const ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#f5c400"/><path d="M8 20 14 7l6 13M10.5 15h7" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
  );

// Connector fork lokal (pola swap-web): wagmi `mock` nerusin request ke `chain.rpcUrls.default`, jadi Anvil yang
// sign pakai akun tes yang di-unlock. Pembungkus reject Dev Tools menyusul di tiket 17.
export const anvilForkWallet = (): Wallet => ({
  id: FORK_CONNECTOR_ID,
  name: WALLET.forkConnector,
  iconUrl: ICON,
  iconBackground: '#f5c400',
  createConnector: (walletDetails) =>
    createConnector((config) => ({
      ...mock({ accounts: [TEST_ACCOUNTS.user] })(config),
      ...walletDetails,
      id: FORK_CONNECTOR_ID,
      name: WALLET.forkConnector,
    })),
});
