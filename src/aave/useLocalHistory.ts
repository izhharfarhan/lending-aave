import { useCallback, useEffect, useState } from 'react';

import { APP_MODE } from '@/config/appMode';
import { SUPPORTED_CHAINS } from '@/config/chains';
import { addEntry, localHistoryKey, parseHistory, type LocalTxEntry } from '@/core/localHistory';

// Tiket 03: mencatat tx dari app. Halaman Riwayat (tiket 22) membacanya lewat `useLocalHistories`.
export function useAddLocalHistory(chainId: number, wallet: string | undefined) {
  return useCallback(
    (entry: LocalTxEntry) => {
      if (!wallet) return;
      const key = localHistoryKey(APP_MODE, chainId, wallet);
      try {
        localStorage.setItem(key, JSON.stringify(addEntry(parseHistory(localStorage.getItem(key)), entry)));
      } catch {
        // localStorage bisa diblokir (private window); riwayat lokal cuma pelengkap indexer.
      }
    },
    [chainId, wallet],
  );
}

function readAll(wallet: string): LocalTxEntry[] {
  try {
    return SUPPORTED_CHAINS.flatMap((chain) => parseHistory(localStorage.getItem(localHistoryKey(APP_MODE, chain.chainId, wallet))));
  } catch {
    return [];
  }
}

/** Tx lokal semua chain untuk wallet ini (halaman Riwayat); dibaca ulang kalau tab lain menulis riwayat. */
export function useLocalHistories(wallet: string | undefined): LocalTxEntry[] {
  const [entries, setEntries] = useState<LocalTxEntry[]>([]);
  useEffect(() => {
    if (!wallet) {
      setEntries([]);
      return;
    }
    const read = () => setEntries(readAll(wallet));
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, [wallet]);
  return entries;
}
