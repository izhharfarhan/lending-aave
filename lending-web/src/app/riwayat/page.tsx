import { chainFromParam } from '@/config/chains';
import { HISTORY } from '@/copy';
import { HISTORY_KINDS, type HistoryKind } from '@/core/history';

import { DevTools } from '../DevTools';
import { FORK_PAGE_BOTTOM } from '../forkPage';
import { HistoryView } from '../HistoryView';
import { MobileNav, Sidebar } from '../Sidebar';
import { WalletButton } from '../WalletStatus';

// Riwayat semua chain (Q18). Dev Tools ikut supaya "maju waktu" bisa dicoba langsung di sini; chain-nya dari
// `?chain=` seperti dashboard. `?jenis=<jenis>` memilih filter jenis di awal (mis. dari banner likuidasi).
export default async function HistoryPage({ searchParams }: PageProps<'/riwayat'>) {
  const { chain, jenis } = await searchParams;
  const initialKind = HISTORY_KINDS.find((kind) => kind === jenis) ?? null;
  const selected = chainFromParam(typeof chain === 'string' ? chain : null);
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 px-4 pb-5 pt-6 md:px-8">
          <div className="flex flex-col gap-2">
            <h1 className="display text-lg font-normal">{HISTORY.title}</h1>
            <MobileNav />
          </div>
          <WalletButton />
        </header>
        <main className={`px-4 pb-16 md:px-8 ${FORK_PAGE_BOTTOM}`}>
          <HistoryView initialKind={initialKind} />
        </main>
      </div>
      <DevTools chainId={selected.chainId} />
    </div>
  );
}
