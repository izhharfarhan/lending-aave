import type { Address, PublicClient } from 'viem';

import { withGasMargin } from '@/core/gasMargin';
import type { WalletRequest } from './supplyTx';

// Gas limit tiap tx dari app (dan test fork, biar jalurnya sama): estimasi di blok terakhir + margin. Tanpa margin,
// wallet/viem pakai estimasi polos yang bisa kurang begitu tx ditambang di blok baru.
export async function gasLimitFor(client: PublicClient, request: WalletRequest, account: Address): Promise<bigint> {
  return withGasMargin(await client.estimateContractGas({ ...request, account } as Parameters<PublicClient['estimateContractGas']>[0]));
}
