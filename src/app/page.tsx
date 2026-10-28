import type { CSSProperties } from 'react';

import { chainFromParam, RESCUE_PANEL } from '@/config/chains';
import { NAV } from '@/copy';

import { ChainDetail } from './ChainDetail';
import { Dashboard } from './Dashboard';
import { Sidebar } from './Sidebar';
import { WalletButton, WalletOverview } from './WalletStatus';

// Chain terpilih dari `?chain=` (Q5): ganti chain = ganti URL, tanpa popup wallet. Wallet baru diminta ganti network
// saat bertransaksi (langkah "Ganti ke <chain>" di panel aksi). Segmen chain di dashboard = pemilih chain.
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { chain, panel } = await searchParams;
  const selected = chainFromParam(typeof chain === 'string' ? chain : null);
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 px-4 pb-5 pt-6 md:px-8">
          <h1 className="display text-lg font-normal">{NAV.dashboard}</h1>
          <WalletButton />
        </header>
        {/* `pb-28` mobile: ruang untuk bar Supply/Borrow yang menempel di bawah layar (tiket 16). */}
        <main className="flex flex-col gap-8 px-4 pb-28 md:px-8 md:pb-16">
          <WalletOverview chainId={selected.chainId} />
          <Dashboard selectedChainId={selected.chainId} />
          {/* Langkah ketiga animasi masuk; di luar `key` biar ganti chain nggak memutarnya lagi. `key`: pilihan
              baris/tab panel milik chain sebelumnya dibuang saat ganti chain. `reveal-holds-sheet`: di mobile cuma memudar,
              karena di dalamnya ada bottom sheet `fixed` (globals.css). */}
          <div className="reveal reveal-holds-sheet" style={{ ['--i' as string]: 2 } as CSSProperties}>
            <ChainDetail key={selected.chainId} chainId={selected.chainId} rescue={panel === RESCUE_PANEL} />
          </div>
        </main>
      </div>
    </div>
  );
}
