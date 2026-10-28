'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

import type { PanelTab } from '@/core/panel';
import { PANEL, SHEET } from '@/copy';

// Harus sama dengan `--breakpoint-md` di globals.css (48rem = 768px): kelas `max-md:`/`md:` yang menampilkan sheet dan
// bar memakai breakpoint itu. Ubah satu, ubah yang lain.
export const MOBILE_QUERY = '(max-width: 767.98px)';

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

/**
 * Layar mobile? Server dan render pertama = desktop. Cuma untuk perilaku (kunci halaman, fokus, role dialog), bukan
 * tampil-sembunyi: itu urusan kelas `max-md:` supaya render pertama di HP sudah benar.
 */
export function useMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}

/** `inert` untuk semua yang bukan `el` atau leluhurnya; mengembalikan fungsi pemulih. */
function inertOutside(el: HTMLElement) {
  const made: HTMLElement[] = [];
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
        sibling.inert = true;
        made.push(sibling);
      }
    }
  }
  return () => made.forEach((sibling) => (sibling.inert = false));
}

/**
 * Tempat panel aksi. Desktop: kotak biasa di samping/bawah tabel (`className`). Mobile: bottom sheet layar penuh (Q19)
 * lewat kelas `max-md:`, jadi sejak render pertama panel nggak pernah muncul di halaman. Ditutup = disembunyikan, bukan
 * dilepas: transaksi yang sedang jalan dan progresnya tetap ada. Selama terbuka di mobile, halaman di belakangnya dikunci
 * dan `inert`, fokus pindah ke sheet lalu kembali ke pemicunya; Escape atau "Tutup" menutupnya. Tombol utama panel
 * menempel di bawah lewat `sheet-cta` (globals.css). Leluhurnya nggak boleh memakai transform (lihat page.tsx).
 */
export function BottomSheet(props: { open: boolean; title: string; onClose: () => void; className: string; children: ReactNode }) {
  const { open, title, onClose } = props;
  const mobile = useMobile();
  const modal = mobile && open;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = ref.current;
    if (!modal || !sheet) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    // Modal yang dibuka sesudahnya (mis. connect wallet) dipasang setelah ini, jadi nggak ikut `inert`.
    const restore = inertOutside(sheet);
    sheet.focus();
    // Escape dari modal lain di atas sheet bukan untuk sheet.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && e.target instanceof Node && sheet.contains(e.target) && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow;
      restore();
      window.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [modal, onClose]);

  return (
    <div
      ref={ref}
      role={mobile ? 'dialog' : undefined}
      aria-modal={mobile || undefined}
      aria-label={mobile ? title : undefined}
      tabIndex={mobile ? -1 : undefined}
      className={`sheet max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:overflow-y-auto max-md:overscroll-contain max-md:bg-panel max-md:outline-none ${
        open ? '' : 'max-md:hidden'
      } ${props.className}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-5 py-3 md:hidden">
        <h2 className="font-medium">{title}</h2>
        <button type="button" className="link text-sm text-muted" onClick={onClose}>
          {SHEET.close}
        </button>
      </div>
      <div className="max-md:flex max-md:flex-1 max-md:flex-col">{props.children}</div>
    </div>
  );
}

/** Bar Supply/Borrow yang menempel di bawah layar mobile untuk membuka sheet (spec 60). Leluhurnya: lihat `BottomSheet`. */
export function ActionBar({ onOpen }: { onOpen: (tab: PanelTab) => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-3 border-t border-line bg-bg/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
      <button type="button" className="btn-accent py-3 text-[15px]" onClick={() => onOpen('supply')}>
        {PANEL.tabs.supply}
      </button>
      <button type="button" className="btn-ghost py-3 text-[15px]" onClick={() => onOpen('borrow')}>
        {PANEL.tabs.borrow}
      </button>
    </div>
  );
}
