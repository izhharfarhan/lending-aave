import { NAV, PAGE } from '@/copy';

// Navigasi kiri (DECISIONS.md Q20). Riwayat dan footer status jaringan menyusul di tiket 22; E-Mode = fitur V2.
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line px-[13px] py-6 md:flex">
      <span className="wordmark px-3 text-ink">{PAGE.brand}</span>
      <p className="mt-8 px-3 text-xs text-faint">{NAV.section}</p>
      <nav className="mt-2 flex flex-col gap-0.5">
        <span aria-current="page" className="relative rounded-md bg-panel-hover px-3 py-2 text-ink">
          <span className="absolute inset-y-2 -left-[13px] w-[2px] bg-accent" />
          {NAV.dashboard}
        </span>
        <span className="rounded-md px-3 py-2 text-muted">{NAV.history}</span>
        <span aria-disabled className="flex items-center justify-between rounded-md px-3 py-2 text-faint">
          {NAV.emode}
          <span className="badge badge-muted text-[9px] tracking-wider">{NAV.soon}</span>
        </span>
      </nav>
    </aside>
  );
}
