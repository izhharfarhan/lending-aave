import { useQuery } from '@tanstack/react-query';
import { rpc } from 'viem/utils';
import { useAccount } from 'wagmi';

import { APP_MODE, IS_FORK } from '@/config/appMode';
import { forkBlock, forkRpcUrl } from '@/config/fork';
import { checkForkGuard, type ForkGuardResult } from '@/core/forkGuard';
import { FORK_CONNECTOR_ID } from './anvilForkWallet';

type AnvilMetadata = { forkedNetwork: { forkBlockNumber: number } | null };

// Mainnet beneran nolak `anvil_metadata` (method not found) → null = bukan fork.
async function fetchRpcForkBlock(chainId: number): Promise<bigint | null> {
  try {
    const { result, error } = await rpc.http(forkRpcUrl(chainId), { body: { method: 'anvil_metadata' } });
    const meta = result as AnvilMetadata | undefined;
    if (error || !meta?.forkedNetwork) return null;
    return BigInt(meta.forkedNetwork.forkBlockNumber);
  } catch {
    return null;
  }
}

export function useForkGuard(chainId: number): ForkGuardResult {
  const { connector } = useAccount();
  const { data: rpcForkBlock } = useQuery({
    queryKey: ['rpcForkBlock', chainId],
    queryFn: () => fetchRpcForkBlock(chainId),
    enabled: IS_FORK,
    // Dicek ulang biar Anvil yang di-restart di blok lain langsung ketahuan.
    refetchInterval: 5_000,
  });

  return checkForkGuard({
    mode: APP_MODE,
    connectorId: connector?.id,
    localConnectorId: FORK_CONNECTOR_ID,
    pinnedForkBlock: IS_FORK ? forkBlock(chainId) : 0n,
    rpcForkBlock,
  });
}
