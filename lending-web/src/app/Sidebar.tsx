'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { indexerSummaryOf, useNetworkStatus, type ChainNetworkStatus } from '@/aave/useNetworkStatus';
import { IS_FORK } from '@/config/appMode';
import { supportedChain } from '@/config/chains';
import { NAV, NETWORK, PAGE } from '@/copy';

// Navigasi kiri (DECISIONS.md Q20) + footer status jaringan (spec story 114, prototype Q22). E-Mode = fitur V2.
export const NAV_LINKS = [
  { href: '/', label: NAV.dashboard },
  { href: '/riwayat', label: NAV.history },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line px-[13px] py-6 md:flex">
      <span className="wordmark px-3 text-ink">{PAGE.brand}</span>
      <p className="mt-8 px-3 text-xs text-faint">{NAV.section}</p>
      <nav className="mt-2 flex flex-col gap-0.5">
        {NAV_LINKS.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? 'page' : undefined}
              className={`relative rounded-md px-3 py-2 ${current ? 'bg-panel-hover text-ink' : 'text-muted hover:text-ink'}`}
            >
              {current && <span className="absolute inset-y-2 -left-[13px] w-[2px] bg-accent" />}
              {label}
            </Link>
          );
        })}
        <span aria-disabled className="flex items-center justify-between rounded-md px-3 py-2 text-faint">
          {NAV.emode}
          <span className="badge badge-muted text-[9px] tracking-wider">{NAV.soon}</span>
        </span>
      </nav>
      <NetworkFooter />
    </aside>
  );
}

function NetworkFooter() {
  const { data: chains } = useNetworkStatus();
  return (
    // Mode fork: tombol Dev Tools menempel di kiri bawah layar (tiket 17), jadi footer diberi ruang di bawahnya.
    <div className={`mt-auto border-t border-line px-3 pt-4 ${IS_FORK ? 'pb-[4.5rem]' : ''}`}>
      <p className="text-xs text-faint">{NETWORK.title}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {(chains ?? []).map((chain) => (
          <li key={chain.chainId} className="flex items-center gap-2 text-xs">
            <span className="text-muted">{supportedChain(chain.chainId).name}</span>
            {chain.head ? (
              <span className="num ml-auto text-faint">#{chain.head.number.toLocaleString('id-ID')}</span>
            ) : (
              <span className="ml-auto text-danger">{NETWORK.rpcFailed}</span>
            )}
          </li>
        ))}
      </ul>
      {chains && <IndexerLine chains={chains} />}
    </div>
  );
}

// Satu baris untuk semua chain: offline (indexer sama untuk ketiganya) > tertinggal (chain mana saja) > sinkron.
function IndexerLine({ chains }: { chains: ChainNetworkStatus[] }) {
  const summary = indexerSummaryOf(chains);
  const lagging = (chain: { chainId: number; blocks: bigint | null }) => {
    const name = supportedChain(chain.chainId).name;
    return chain.blocks === null ? NETWORK.laggingUnknown(name) : NETWORK.laggingBlocks(name, chain.blocks.toLocaleString('id-ID'));
  };
  const [text, tone, dot] =
    summary.kind === 'offline'
      ? [NETWORK.indexerOffline, 'text-danger', 'bg-danger']
      : summary.kind === 'lagging'
        ? [NETWORK.indexerLagging(summary.chains.map(lagging).join(', ')), 'text-warn', 'bg-warn']
        : [NETWORK.indexerSynced, 'text-muted', 'bg-muted'];
  return (
    <p className={`mt-3 flex items-start gap-2 text-xs ${tone}`}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {text}
    </p>
  );
}

/** Navigasi di bawah md (sidebar disembunyikan): tautan halaman di header. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-4 text-sm md:hidden">
      {NAV_LINKS.map(({ href, label }) => (
        <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={pathname === href ? 'text-ink' : 'text-muted'}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
