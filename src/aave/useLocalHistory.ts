import { useCallback } from 'react';

import { APP_MODE } from '@/config/appMode';
import { addEntry, localHistoryKey, parseHistory, type LocalTxEntry } from '@/core/localHistory';

// Tiket 03: cuma mencatat. Tampilan Riwayat (gabung indexer) di tiket 22.
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
