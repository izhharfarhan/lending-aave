import { erc20Abi, type Address, type ContractFunctionParameters } from 'viem';

import type { NextStep } from '@/core/nextStep';
import { poolAbi } from './abis';

export type WalletRequest = ContractFunctionParameters & { address: Address };

type SupplyContext = { pool: Address; asset: Address; amount: bigint; user: Address };

// Langkah wallet hasil `nextStep` → panggilan kontrak. Approve selalu ke Aave Pool (alamat address-book), dengan
// jumlah dari nextStep: exact = jumlah supply, unlimited = maxUint256 (#8). Reset = approve 0 (USDT).
export function supplyRequest(step: Extract<NextStep, { step: 'resetApproval' | 'approve' | 'supply' }>, ctx: SupplyContext): WalletRequest {
  switch (step.step) {
    case 'resetApproval':
      return { address: ctx.asset, abi: erc20Abi, functionName: 'approve', args: [ctx.pool, 0n] };
    case 'approve':
      return { address: ctx.asset, abi: erc20Abi, functionName: 'approve', args: [ctx.pool, step.amount] };
    case 'supply':
      // onBehalfOf = user sendiri; referralCode 0 (program referral Aave sudah nggak aktif).
      return { address: ctx.pool, abi: poolAbi, functionName: 'supply', args: [ctx.asset, ctx.amount, ctx.user, 0] };
  }
}
