import { queryOptions, useQueries, useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { useAccount, useConfig, type Config } from 'wagmi';
import { getPublicClient } from 'wagmi/actions';

import { WHITELIST } from '@/config/assets';
import { SUPPORTED_CHAINS } from '@/config/chains';
import { AAVE } from '@/config/contracts';
import { buildChainView } from '@/core/chainPosition';
import { withRandomLatency } from '@/devtools/withRandomLatency';
import { readChain } from './readChain';

// Posisi satu chain: dibaca ulang tiap ±30 detik dan saat tab kembali difokuskan (Q4). Belum connect = cuma data
// reserve (daftar aset + APY, Q6). `read` mentah ikut dikembalikan untuk simulasi dan harga likuidasi. Kunci query sama
// untuk dashboard dan detail chain, jadi chain terpilih nggak dibaca dua kali. Dev Tools bisa menunda tiap bacaan 0–3
// detik (fork saja; di mainnet flag-nya selalu mati).
function chainViewQuery(config: Config, chainId: number, user: Address | undefined) {
  const client = getPublicClient(config, { chainId });
  const read = withRandomLatency(() => readChain(client!, { contracts: AAVE[chainId], whitelist: WHITELIST[chainId], user }));
  return queryOptions({
    queryKey: ['chainRead', chainId, user ?? null],
    queryFn: read,
    enabled: Boolean(client),
    select: (read) => ({ read, view: buildChainView(read, WHITELIST[chainId]) }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useChainView(chainId: number) {
  const { address } = useAccount();
  return useQuery(chainViewQuery(useConfig(), chainId, address));
}

/** Dashboard semua chain (ADR 0001): satu bacaan per chain, paralel, urutan = `SUPPORTED_CHAINS`. */
export function useAllChainViews() {
  const { address } = useAccount();
  const config = useConfig();
  return useQueries({ queries: SUPPORTED_CHAINS.map((chain) => chainViewQuery(config, chain.chainId, address)) });
}
