import { erc20Abi, type Address, type ContractFunctionParameters } from 'viem';

import type { AaveContracts } from '@/config/contracts';
import type { NextStep, WalletStepName } from '@/core/nextStep';
import type { PanelTx } from '@/core/panel';
import { debtTokenAbi, gatewayAbi, poolAbi } from './abis';

/** `value` = ETH yang ikut dikirim (supply/repay ETH lewat gateway). */
export type WalletRequest = ContractFunctionParameters & { address: Address; value?: bigint };

type PoolContext = {
  pool: Address;
  asset: Address;
  /** Argumen `amount` transaksi utama; repay lunas penuh / withdraw semua = `type(uint256).max`. */
  amount: bigint;
  user: Address;
  /** Toggle jaminan: nyalakan (`true`) atau matikan. */
  useAsCollateral?: boolean;
  /**
   * ETH lewat WrappedTokenGateway: `value` = ETH yang ikut dikirim (supply/repay; repay penuh = utang + bantalan),
   * `aWeth` = token yang di-approve ke gateway untuk withdraw, `variableDebtWeth` = token credit delegation untuk borrow.
   */
  gateway?: { address: Address; value: bigint; aWeth: Address; variableDebtWeth: Address };
};

// Mode bunga variabel; stable rate sudah dihapus di v3.
const VARIABLE_RATE = 2n;

// Langkah wallet hasil `nextStep` → panggilan kontrak (alamat address-book), jumlah izin dari nextStep: exact = yang
// dibutuhkan aksi, unlimited = maxUint256 (#8). Approve ERC20 ke Pool; lewat gateway cuma withdraw ETH yang minta
// approve (aWETH ke gateway), supply/repay ETH tanpa izin. Reset = approve 0 (USDT).
// onBehalfOf = user sendiri; referralCode 0 (program referral Aave sudah nggak aktif).
export function poolRequest(step: Extract<NextStep, { step: WalletStepName }>, ctx: PoolContext): WalletRequest {
  switch (step.step) {
    case 'resetApproval':
      return { address: ctx.asset, abi: erc20Abi, functionName: 'approve', args: [ctx.pool, 0n] };
    case 'approve':
      if (ctx.gateway) {
        const { address, aWeth } = ctx.gateway;
        return { address: aWeth, abi: erc20Abi, functionName: 'approve', args: [address, step.amount] };
      }
      return { address: ctx.asset, abi: erc20Abi, functionName: 'approve', args: [ctx.pool, step.amount] };
    case 'delegate': {
      if (!ctx.gateway) throw new Error('Credit delegation cuma untuk borrow ETH lewat gateway');
      const { address, variableDebtWeth } = ctx.gateway;
      return { address: variableDebtWeth, abi: debtTokenAbi, functionName: 'approveDelegation', args: [address, step.amount] };
    }
    case 'supply':
      if (ctx.gateway) {
        const { address, value } = ctx.gateway;
        return { address, abi: gatewayAbi, functionName: 'depositETH', args: [ctx.pool, ctx.user, 0], value };
      }
      return { address: ctx.pool, abi: poolAbi, functionName: 'supply', args: [ctx.asset, ctx.amount, ctx.user, 0] };
    case 'borrow':
      // Gateway berutang atas nama user (credit delegation), lalu mengirim ETH ke user.
      if (ctx.gateway) return { address: ctx.gateway.address, abi: gatewayAbi, functionName: 'borrowETH', args: [ctx.pool, ctx.amount, 0] };
      return { address: ctx.pool, abi: poolAbi, functionName: 'borrow', args: [ctx.asset, ctx.amount, VARIABLE_RATE, 0, ctx.user] };
    case 'repay':
      // Gateway membayar min(amount, utang) dan mengembalikan sisa `value`; amount = uint256.max untuk lunas penuh.
      if (ctx.gateway) {
        const { address, value } = ctx.gateway;
        return { address, abi: gatewayAbi, functionName: 'repayETH', args: [ctx.pool, ctx.amount, ctx.user], value };
      }
      return { address: ctx.pool, abi: poolAbi, functionName: 'repay', args: [ctx.asset, ctx.amount, VARIABLE_RATE, ctx.user] };
    case 'withdraw':
      // `to` = user sendiri. ETH: gateway menarik aWETH user (uint256.max = seluruh saldo saat eksekusi), lalu kirim ETH.
      if (ctx.gateway) {
        return { address: ctx.gateway.address, abi: gatewayAbi, functionName: 'withdrawETH', args: [ctx.pool, ctx.amount, ctx.user] };
      }
      return { address: ctx.pool, abi: poolAbi, functionName: 'withdraw', args: [ctx.asset, ctx.amount, ctx.user] };
    case 'setCollateral':
      // Wajib eksplisit: default diam-diam bisa berarti "matikan jaminan".
      if (ctx.useAsCollateral === undefined) throw new Error('setCollateral butuh useAsCollateral');
      return {
        address: ctx.pool,
        abi: poolAbi,
        functionName: 'setUserUseReserveAsCollateral',
        args: [ctx.asset, ctx.useAsCollateral],
      };
  }
}

/** Request langkah wallet untuk rencana panel saat ini (dipakai app dan test fork, biar jalurnya sama). */
export function requestFor(step: Extract<NextStep, { step: WalletStepName }>, ctx: {
  contracts: AaveContracts;
  asset: Address;
  user: Address;
  plan: PanelTx;
}): WalletRequest {
  const { contracts, plan } = ctx;
  return poolRequest(step, {
    pool: contracts.pool,
    asset: ctx.asset,
    amount: plan.send,
    user: ctx.user,
    useAsCollateral: plan.useAsCollateral,
    gateway: plan.gateway
      ? {
          address: contracts.wrappedTokenGateway,
          value: plan.gateway.value,
          aWeth: contracts.aWeth,
          variableDebtWeth: contracts.variableDebtWeth,
        }
      : undefined,
  });
}
