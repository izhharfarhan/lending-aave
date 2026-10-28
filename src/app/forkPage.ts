import { IS_FORK } from '@/config/appMode';

// Bukan di DevTools.tsx: modul 'use client' nggak bisa memberi nilai ke server component (page.tsx).
/** Mobile, mode fork: ruang di bawah halaman supaya baris terakhir bisa digulir ke atas pil Dev Tools (di atas bar aksi). */
export const FORK_PAGE_BOTTOM = IS_FORK ? 'max-md:pb-36' : '';
