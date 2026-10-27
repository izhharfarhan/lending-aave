import { erc20Abi, parseAbi, parseEther, type Address } from 'viem';

import { poolAbi } from '../../src/aave/abis';
import { publicClient, TEST_ACCOUNT, testClient, walletClient } from './clients';
import { contracts } from './likeTheApp';

export const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
/** Jumlah USDC/USDT (6 desimal). */
export const units = (n: number) => BigInt(Math.round(n * 1e6));
const wethAbi = parseAbi(['function deposit() payable']);

// Jaminan ETH disiapkan langsung lewat Pool sebagai WETH: supply ETH lewat gateway baru ada di tiket 06.
export async function supplyWethCollateral(eth: string) {
  const value = parseEther(eth);
  const send = async (hash: Promise<`0x${string}`>) => publicClient.waitForTransactionReceipt({ hash: await hash });
  await send(walletClient.writeContract({ address: WETH, abi: wethAbi, functionName: 'deposit', value }));
  await send(walletClient.writeContract({ address: WETH, abi: erc20Abi, functionName: 'approve', args: [contracts.pool, value] }));
  await send(walletClient.writeContract({ address: contracts.pool, abi: poolAbi, functionName: 'supply', args: [WETH, value, TEST_ACCOUNT, 0] }));
}

export async function advanceDays(days: number) {
  await testClient.increaseTime({ seconds: days * 24 * 60 * 60 });
  await testClient.mine({ blocks: 1 });
}
