import { encodeFunctionData, type Address, type PublicClient } from 'viem';
import { estimateL1Fee } from 'viem/op-stack';

import type { AaveContracts } from '@/config/contracts';
import { isOpStack, networkFee, plannedGas, typicalActionFee } from '@/core/networkFee';
import type { PanelTx } from '@/core/panel';
import { plannedSteps, requestFor, type WalletStep } from './poolTx';

export type FeeEstimate = {
  /** Total semua transaksi yang tersisa, wei: gas × (baseFee + priority fee) + L1 fee. */
  wei: bigint;
  /** Bagian L1 fee (OP Stack / Base) dari `wei`; 0 di chain lain. */
  l1Fee: bigint;
};

// DECISIONS.md Q10 (pola Q12 swap-web): semua bacaan on-chain untuk biaya jaringan, hitungannya di `core/networkFee`.
// Langkah pertama diestimasi atas calldata asli (estimasi polos, tanpa margin gas limit); langkah sesudahnya pakai
// `STEP_GAS`, karena transaksi utama revert di estimateGas selama izinnya belum ada. OP Stack (Base) dikenali dari
// `isOpStack`; L1 fee per transaksi dari `GasPriceOracle.getL1Fee` (viem `estimateL1Fee`).
export async function fetchNetworkFee(
  client: PublicClient,
  args: { chainId: number; contracts: AaveContracts; account: Address; asset: Address; step: WalletStep; plan: PanelTx },
): Promise<FeeEstimate> {
  const { chainId, account, step, plan } = args;
  const ctx = { contracts: args.contracts, asset: args.asset, user: account, plan };
  const steps = plannedSteps(step, plan.main);
  // Langkah sesudah yang pertama cuma butuh calldata (L1 fee Base): izin sesudah reset pakai jumlah transaksi utama.
  const requests = steps.map((name, i) =>
    requestFor(i === 0 ? step : name === 'approve' ? { step: 'approve', amount: plan.send } : ({ step: name } as WalletStep), ctx),
  );
  const opStack = isOpStack(chainId);
  const [block, maxPriorityFeePerGas, firstGas, l1Fees] = await Promise.all([
    client.getBlock(),
    client.estimateMaxPriorityFeePerGas(),
    client.estimateContractGas({ ...requests[0], account } as Parameters<PublicClient['estimateContractGas']>[0]),
    opStack
      ? Promise.all(
          requests.map((r) =>
            estimateL1Fee(client, { chain: client.chain, account, to: r.address, data: encodeFunctionData(r as never), value: r.value }),
          ),
        )
      : null,
  ]);
  if (block.baseFeePerGas === null) throw new Error(`Chain ${chainId} belum EIP-1559 (blok tanpa baseFee)`);

  const gas = plannedGas(steps, firstGas);
  const wei = networkFee({
    chainId,
    txs: gas.map((g, i) => (l1Fees ? { gas: g, l1Fee: l1Fees[i] } : { gas: g })),
    baseFeePerGas: block.baseFeePerGas,
    maxPriorityFeePerGas,
  });
  return { wei, l1Fee: l1Fees?.reduce((sum, fee) => sum + fee, 0n) ?? 0n };
}

/** Badge kartu chain (Q10): perkiraan kasar biaya satu aksi Aave dari gasPrice chain itu saat ini, wei. */
export async function fetchTypicalActionFee(client: PublicClient): Promise<bigint> {
  return typicalActionFee(await client.getGasPrice());
}
