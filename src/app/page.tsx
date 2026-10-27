import Link from 'next/link';

import { chainFromParam, SUPPORTED_CHAINS } from '@/config/chains';
import { CHAIN_PICKER, NAV } from '@/copy';

import { ChainDetail } from './ChainDetail';
import { Sidebar } from './Sidebar';
import { WalletButton, WalletOverview } from './WalletStatus';

// Chain terpilih dari `?chain=` (Q5): ganti chain = ganti URL, tanpa popup wallet. Wallet baru diminta ganti network
// saat bertransaksi (langkah "Ganti ke <chain>" di panel aksi). Kartu chain dashboard menyusul di tiket 11.
export default async function Home({ searchParams }: PageProps<'/'>) {
  const { chain } = await searchParams;
  const selected = chainFromParam(typeof chain === 'string' ? chain : null);
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 px-4 pb-5 pt-6 md:px-8">
          <h1 className="display text-lg font-normal">{NAV.dashboard}</h1>
          <WalletButton />
        </header>
        <main className="flex flex-col gap-8 px-4 pb-16 md:px-8">
          <nav aria-label={CHAIN_PICKER.label} className="flex w-fit gap-1 rounded-md bg-raised p-1">
            {SUPPORTED_CHAINS.map((c) => (
              <Link
                key={c.slug}
                href={`/?chain=${c.slug}`}
                aria-current={c.chainId === selected.chainId ? 'page' : undefined}
                className={`rounded px-3 py-1.5 text-sm ${c.chainId === selected.chainId ? 'bg-panel-hover text-ink' : 'text-muted'}`}
              >
                {c.name}
              </Link>
            ))}
          </nav>
          <WalletOverview chainId={selected.chainId} />
          {/* `key`: pilihan baris/tab panel milik chain sebelumnya dibuang saat ganti chain. */}
          <ChainDetail key={selected.chainId} chainId={selected.chainId} />
        </main>
      </div>
    </div>
  );
}
