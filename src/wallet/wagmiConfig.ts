import { connectorsForWallets, type WalletList } from '@rainbow-me/rainbowkit';
import { coinbaseWallet, injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import type { Chain } from 'viem';
import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';

import { IS_FORK } from '@/config/appMode';
import { forkRpcUrl } from '@/config/fork';
import { PAGE, WALLET } from '@/copy';
import { anvilForkWallet } from './anvilForkWallet';

// EOA-only (pola swap-web Q3): smart wallet Coinbase belum didukung.
coinbaseWallet.preference = 'eoaOnly';

// Connector mock baca RPC dari definisi chain, bukan dari `transports`, jadi di mode fork definisi chain-nya
// sendiri yang diarahkan ke Anvil.
const forked = <C extends Chain>(chain: C): C =>
  IS_FORK ? { ...chain, rpcUrls: { default: { http: [forkRpcUrl(chain.id)] } } } : chain;

const appChains = [forked(mainnet)] as const;

// Harus ditulis lengkap `process.env.NEXT_PUBLIC_...` biar di-inline Next ke bundle browser.
const MAINNET_RPC_URLS: Record<number, string | undefined> = {
  [mainnet.id]: process.env.NEXT_PUBLIC_RPC_URL_1,
};

// Mode fork: `undefined` = URL dari definisi chain (Anvil lokal). Fork yang baru nyala masih "dingin": tiap slot
// storage diambil dulu dari RPC archive, jadi getReservesData pertama bisa jauh lewat timeout default viem (10 detik).
function appTransport(chainId: number) {
  return IS_FORK ? http(undefined, { timeout: 120_000 }) : http(MAINNET_RPC_URLS[chainId]);
}

const wallets: WalletList = [
  ...(IS_FORK ? [{ groupName: WALLET.forkGroup, wallets: [anvilForkWallet] }] : []),
  { groupName: WALLET.walletGroup, wallets: [injectedWallet, coinbaseWallet] },
];

export const wagmiConfig = createConfig({
  chains: appChains,
  // Belum ada WalletConnect (jalan lokal saja, #12), jadi projectId nggak kepake.
  connectors: connectorsForWallets(wallets, { appName: PAGE.brand, projectId: '' }),
  transports: { [mainnet.id]: appTransport(mainnet.id) },
  ssr: true,
});
