'use client';

import '@rainbow-me/rainbowkit/styles.css';

import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';

import { wagmiConfig } from '@/wallet/wagmiConfig';

// Dialog RainbowKit ikut tema di globals.css (latar hampir hitam, aksen violet, sudut kecil). RainbowKit butuh warna
// jadi, bukan var CSS, jadi nilainya disamain manual dengan token di :root.
const base = darkTheme({ accentColor: '#a78bfa', accentColorForeground: '#12082b', borderRadius: 'small', overlayBlur: 'small' });
const walletTheme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: '#121413',
    modalBorder: 'rgba(226, 236, 229, 0.14)',
    modalBackdrop: 'rgba(5, 6, 5, 0.75)',
    modalText: '#e6ebe7',
    modalTextSecondary: '#8a918c',
    menuItemBackground: '#171a18',
    generalBorder: 'rgba(226, 236, 229, 0.14)',
    connectionIndicator: '#e6ebe7',
    error: '#ff6b5d',
  },
  fonts: { body: 'var(--font-plex-sans), ui-sans-serif, sans-serif' },
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={walletTheme}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
