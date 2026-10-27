import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';

import { WHITELIST } from '@/config/assets';
import { AAVE } from '@/config/contracts';
import { buildChainView } from '@/core/chainPosition';
import { readChain } from './readChain';

// Posisi satu chain: dibaca ulang tiap ±30 detik dan saat tab kembali difokuskan (Q4). Belum connect = cuma data
// reserve (daftar aset + APY, Q6).
export function useChainView(chainId: number) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId });

  return useQuery({
    queryKey: ['chainRead', chainId, address ?? null],
    queryFn: () => readChain(client!, { contracts: AAVE[chainId], whitelist: WHITELIST[chainId], user: address }),
    enabled: Boolean(client),
    select: (read) => buildChainView(read, WHITELIST[chainId]),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
