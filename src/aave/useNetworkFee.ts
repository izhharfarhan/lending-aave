import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { useConfig, usePublicClient } from 'wagmi';
import { getPublicClient } from 'wagmi/actions';

import { SUPPORTED_CHAINS } from '@/config/chains';
import { AAVE } from '@/config/contracts';
import type { NextStep } from '@/core/nextStep';
import type { PanelTx } from '@/core/panel';
import { fetchNetworkFee, fetchTypicalActionFee } from './fetchNetworkFee';
import { isWalletStep } from '@/core/nextStep';

type Args = {
  chainId: number;
  user: Address | undefined;
  asset: Address;
  /** `PanelState.stepBeforeGasCheck`: langkah yang tersisa kalau ETH dianggap cukup. */
  step: NextStep;
  plan: PanelTx;
};

/**
 * Biaya jaringan semua langkah wallet yang tersisa (izin + transaksi utama), wei. `fee: null` = nggak ada langkah
 * wallet, belum connect, sedang dimuat pertama kali, atau estimasi gagal (`failed`); nextStep lalu cuma mengunci ETH 0.
 */
export function useNetworkFee({ chainId, user, asset, step, plan }: Args): { fee: bigint | null; failed: boolean } {
  const client = usePublicClient({ chainId });
  const first = isWalletStep(step) ? step : null;

  const query = useQuery({
    // Seluruh langkah + rencana transaksi jadi kunci (bigint → string: react-query meng-hash kunci lewat JSON).
    queryKey: ['networkFee', chainId, user ?? null, asset, JSON.stringify({ first, plan }, (_, v) => (typeof v === 'bigint' ? String(v) : v))],
    queryFn: () => fetchNetworkFee(client!, { chainId, contracts: AAVE[chainId], account: user!, asset, step: first!, plan }),
    enabled: Boolean(client && user && first),
    // Biaya berubah tiap blok; ikut ritme baca ulang posisi (±30 detik). Selama kunci berganti, angka lama tetap tampil.
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
  if (!first) return { fee: null, failed: false };
  return { fee: query.data?.wei ?? null, failed: query.isError };
}

/** Perkiraan kasar biaya satu aksi Aave per chain untuk badge segmen chain (Q10), wei, urutan = `SUPPORTED_CHAINS`. */
export function useTypicalActionFees(enabled: boolean): (bigint | null)[] {
  const config = useConfig();
  const queries = useQueries({
    queries: SUPPORTED_CHAINS.map(({ chainId }) => {
      const client = getPublicClient(config, { chainId });
      return {
        queryKey: ['typicalActionFee', chainId],
        queryFn: () => fetchTypicalActionFee(client!),
        enabled: enabled && Boolean(client),
        refetchInterval: 30_000,
        retry: false,
      };
    }),
  });
  return queries.map((query) => query.data ?? null);
}
