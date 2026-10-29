import { erc20Abi, parseAbi, parseEther, type Address } from 'viem';

import { poolAbi } from '../../src/aave/abis';
import { gasLimitFor } from '../../src/aave/gasLimit';
import type { WalletRequest } from '../../src/aave/poolTx';
import { publicClient, TEST_ACCOUNT, testClient, walletClient } from './clients';
import { contracts } from './likeTheApp';

export const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
/** ETHx: bukan aset whitelist; di blok pin ber-LTV 0, Dibekukan, dan di `ltvzeroBitmap` kategori E-Mode 1. */
export const ETHX: Address = '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b';
/** Jumlah USDC/USDT (6 desimal). */
export const units = (n: number) => BigInt(Math.round(n * 1e6));
const wethAbi = parseAbi(['function deposit() payable']);

/**
 * Kirim tx setup test dengan margin gas seperti app (core/gasMargin.ts): estimasi polos bisa kehabisan gas di blok
 * berikutnya, dan revert-nya diam-diam bikin test berikutnya gagal dengan pesan yang menyesatkan.
 */
export async function sendWithMargin(request: WalletRequest) {
  const hash = await walletClient.writeContract({ ...request, gas: await gasLimitFor(publicClient, request, TEST_ACCOUNT) } as never);
  expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
}

// Jaminan WETH disiapkan langsung lewat Pool: setup cepat untuk test yang bukan soal jalur supply ETH.
export async function supplyWethCollateral(eth: string) {
  const value = parseEther(eth);
  await sendWithMargin({ address: WETH, abi: wethAbi, functionName: 'deposit', args: [], value });
  await sendWithMargin({ address: WETH, abi: erc20Abi, functionName: 'approve', args: [contracts.pool, value] });
  await sendWithMargin({ address: contracts.pool, abi: poolAbi, functionName: 'supply', args: [WETH, value, TEST_ACCOUNT, 0] });
}

export async function advanceDays(days: number) {
  await advanceHours(days * 24);
}

export async function advanceHours(hours: number) {
  await testClient.increaseTime({ seconds: hours * 60 * 60 });
  await testClient.mine({ blocks: 1 });
}
