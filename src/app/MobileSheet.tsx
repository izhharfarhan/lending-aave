'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { PanelTab } from '@/core/panel';
import { PANEL, SHEET } from '@/copy';

// Sama dengan breakpoint `md` Tailwind: di bawahnya sidebar hilang dan panel aksi jadi bottom sheet (Q19).
const MOBILE_QUERY = '(max-width: 767.98px)';

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

/** Layar mobile? Server dan render pertama = desktop (panel di samping). */
export function useMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}

/**
 * Bottom sheet layar penuh berisi panel aksi (Q19). Ditutup = disembunyikan, bukan dilepas: transaksi yang sedang jalan
 * dan progresnya tetap ada saat sheet dibuka lagi. Selama terbuka, halaman di belakangnya dikunci dan `inert`, fokus
 * pindah ke sheet lalu kembali ke pemicunya; Escape atau "Tutup" menutupnya. Tombol utama panel menempel di bawah lewat
 * `sheet-cta` (globals.css). Lewat portal ke `body`: animasi `.reveal` di atasnya memakai transform, yang membuat
 * `position: fixed` ikut kotak induknya, bukan layar.
 */
export function BottomSheet(props: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { open, title, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = ref.current;
    if (!open || !sheet) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    // Modal lain yang dibuka sesudahnya (mis. connect wallet) dipasang setelah ini, jadi nggak ikut `inert`.
    const background = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el !== sheet && !el.inert);
    background.forEach((el) => (el.inert = true));
    sheet.focus();
    // Escape dari modal lain di atas sheet bukan untuk sheet.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && e.target instanceof Node && sheet.contains(e.target) && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow;
      background.forEach((el) => (el.inert = false));
      window.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [open, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      hidden={!open}
      className="sheet fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-panel outline-none [&[hidden]]:hidden"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-5 py-3">
        <h2 className="font-medium">{title}</h2>
        <button type="button" className="link text-sm text-muted" onClick={onClose}>
          {SHEET.close}
        </button>
      </div>
      <div className="flex flex-1 flex-col">{props.children}</div>
    </div>,
    document.body,
  );
}

/** Bar Supply/Borrow yang menempel di bawah layar mobile untuk membuka sheet (spec 60). Portal: lihat `BottomSheet`. */
export function ActionBar({ onOpen }: { onOpen: (tab: PanelTab) => void }) {
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-3 border-t border-line bg-bg/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <button type="button" className="btn-accent py-3 text-[15px]" onClick={() => onOpen('supply')}>
        {PANEL.tabs.supply}
      </button>
      <button type="button" className="btn-ghost py-3 text-[15px]" onClick={() => onOpen('borrow')}>
        {PANEL.tabs.borrow}
      </button>
    </div>,
    document.body,
  );
}
