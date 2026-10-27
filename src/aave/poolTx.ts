import { erc20Abi, type Address, type ContractFunctionParameters } from 'viem';

import type { NextStep, WalletStepName } from '@/core/nextStep';
import { poolAbi } from './abis';

export type WalletRequest = ContractFunctionParameters & { address: Address };

type PoolContext = {
  pool: Address;
  asset: Address;
  /** Argumen `amount` transaksi utama; repay lunas penuh = `type(uint256).max` (`RepayPlan.send`). */
  amount: bigint;
  user: Address;
};

// Mode bunga variabel; stable rate sudah dihapus di v3.
const VARIABLE_RATE = 2n;

// Langkah wallet hasil `nextStep` → panggilan kontrak. Approve selalu ke Aave Pool (alamat address-book), dengan
// jumlah dari nextStep: exact = jumlah supply/repay, unlimited = maxUint256 (#8). Reset = approve 0 (USDT).
// onBehalfOf = user sendiri; referralCode 0 (program referral Aave sudah nggak aktif).
export function poolRequest(step: Extract<NextStep, { step: WalletStepName }>, ctx: PoolContext): WalletRequest {
  switch (step.step) {
    case 'resetApproval':
      return { address: ctx.asset, abi: erc20Abi, functionName: 'approve', args: [ctx.pool, 0n] };
    case 'approve':
      return { address: ctx.asset, abi: erc20Abi, functionName: 'approve', args: [ctx.pool, step.amount] };
    case 'supply':
      return { address: ctx.pool, abi: poolAbi, functionName: 'supply', args: [ctx.asset, ctx.amount, ctx.user, 0] };
    case 'borrow':
      return { address: ctx.pool, abi: poolAbi, functionName: 'borrow', args: [ctx.asset, ctx.amount, VARIABLE_RATE, 0, ctx.user] };
    case 'repay':
      return { address: ctx.pool, abi: poolAbi, functionName: 'repay', args: [ctx.asset, ctx.amount, VARIABLE_RATE, ctx.user] };
  }
}
