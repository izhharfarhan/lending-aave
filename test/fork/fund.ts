import { erc20Abi, parseEther, type Address } from 'viem';

import { publicClient, testClient, walletClient } from './clients';

// Holder ERC20 di blok pin 26.282.000 (dicek 2026-10-27, keduanya EOA): token tes didapat dari impersonate holder,
// bukan mint palsu (pola swap-web Q23). USDC ~33 juta, USDT (Binance 8) ~16 miliar.
const HOLDERS: Record<Address, Address> = {
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': '0x55FE002aefF02F77364de339a1292923A15844B8',
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': '0xF977814e90dA44bFA03b6295A0616a897441aceC',
};

export async function fundErc20(token: Address, to: Address, amount: bigint) {
  const holder = HOLDERS[token];
  if (!holder) throw new Error(`Belum ada holder ${token} untuk fork test`);
  // Anvil mengizinkan kirim tx atas nama holder tanpa private key; ETH-nya diisi untuk gas.
  await testClient.impersonateAccount({ address: holder });
  await testClient.setBalance({ address: holder, value: parseEther('1') });
  try {
    const hash = await walletClient.writeContract({ account: holder, address: token, abi: erc20Abi, functionName: 'transfer', args: [to, amount] });
    await publicClient.waitForTransactionReceipt({ hash });
  } finally {
    await testClient.stopImpersonatingAccount({ address: holder });
  }
}
