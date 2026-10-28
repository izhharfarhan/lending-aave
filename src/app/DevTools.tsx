'use client';

import dynamic from 'next/dynamic';

import { IS_FORK } from '@/config/appMode';

// Panel Dev Tools cuma dimuat di FORK MODE (tiket 17, pola swap-web). Import dinamis di Client Component, jadi kodenya
// pecah ke chunk sendiri yang nggak pernah diambil browser di mode mainnet. Yang tetap ikut bundle mainnet cuma store
// flag dan pembungkus latency (dipakai `useChainView`), dan flag-nya di sana selalu mati.
const DevToolsPanel = dynamic(() => import('./DevToolsPanel'), { ssr: false });

export function DevTools({ chainId }: { chainId: number }) {
  return IS_FORK ? <DevToolsPanel chainId={chainId} /> : null;
}
