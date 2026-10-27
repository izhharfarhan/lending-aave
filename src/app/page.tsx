import { SUPPORTED_CHAINS } from '@/config/chains';
import { NAV } from '@/copy';

import { ChainDetail } from './ChainDetail';
import { Sidebar } from './Sidebar';
import { WalletButton, WalletOverview } from './WalletStatus';

export default function Home() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 px-4 pb-5 pt-6 md:px-8">
          <h1 className="display text-lg font-normal">{NAV.dashboard}</h1>
          <WalletButton />
        </header>
        <main className="flex flex-col gap-8 px-4 pb-16 md:px-8">
          <WalletOverview />
          {/* Tiket 02: Ethereum saja; pemilihan chain masuk di tiket 10. */}
          <ChainDetail chainId={SUPPORTED_CHAINS[0].chainId} />
        </main>
      </div>
    </div>
  );
}
