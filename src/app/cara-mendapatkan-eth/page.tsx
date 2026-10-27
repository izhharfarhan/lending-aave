import Link from 'next/link';

import { IS_FORK } from '@/config/appMode';
import { GET_ETH } from '@/copy';

import { Sidebar } from '../Sidebar';

// Halaman bantuan dari tombol "ETH kurang untuk biaya jaringan" (spec 86, DECISIONS.md Q10).
export default function GetEthPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex min-w-0 max-w-[640px] flex-1 flex-col gap-6 px-4 pb-16 pt-6 md:px-8">
        <Link href="/" className="link w-fit text-sm text-muted">
          {GET_ETH.back}
        </Link>
        <h1 className="display text-lg font-normal">{GET_ETH.title}</h1>
        {IS_FORK && <p className="rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">{GET_ETH.fork}</p>}
        <p className="text-sm leading-relaxed text-muted">{GET_ETH.intro}</p>
        {GET_ETH.sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="text-base font-medium">{section.title}</h2>
            <p className="text-sm leading-relaxed text-muted">{section.body}</p>
          </section>
        ))}
      </main>
    </div>
  );
}
