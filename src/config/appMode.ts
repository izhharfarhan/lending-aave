import type { AppMode } from '@/core/forkGuard';

// Harus ditulis lengkap `process.env.NEXT_PUBLIC_...` biar di-inline Next ke bundle browser.
const raw = process.env.NEXT_PUBLIC_APP_MODE;

if (raw !== 'fork' && raw !== 'mainnet') {
  throw new Error(
    `NEXT_PUBLIC_APP_MODE harus "fork" atau "mainnet" (dapet ${JSON.stringify(raw)}). Jalanin lewat pnpm dev:fork / dev:mainnet.`,
  );
}

export const APP_MODE: AppMode = raw;
export const IS_FORK = APP_MODE === 'fork';
