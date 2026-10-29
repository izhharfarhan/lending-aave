import { AaveV3Arbitrum, AaveV3Base, AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import { erc20Abi, type Address } from 'viem';

import { sendAs } from './admin';
import { publicClient, testClient, walletClient, type ForkClients } from './clients';

// Holder ERC20 di blok pin 26.282.000 (dicek 2026-10-27, keduanya EOA): token tes didapat dari impersonate holder,
// bukan mint palsu (pola swap-web Q23). USDC ~33 juta, USDT (Binance 8) ~16 miliar.
const HOLDERS: Record<number, Record<Address, Address>> = {
  1: {
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': '0x55FE002aefF02F77364de339a1292923A15844B8',
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': '0xF977814e90dA44bFA03b6295A0616a897441aceC',
  },
};

// Chain tanpa holder yang dicek: aToken reserve itu sendiri memegang underlying-nya. Cukup untuk test kecil (beberapa
// ratus unit), tapi saldo underlying aToken jadi lebih kecil dari `virtualUnderlyingBalance`: test L2 yang menarik
// jumlah besar sebaiknya pakai holder EOA yang dicek (seperti Ethereum di atas).
const BOOKS: Record<number, { ASSETS: Record<string, { UNDERLYING: Address; A_TOKEN: Address }> }> = {
  1: AaveV3Ethereum,
  8453: AaveV3Base,
  42161: AaveV3Arbitrum,
};
function holderOf(chainId: number, token: Address): Address {
  const holder = HOLDERS[chainId]?.[token];
  if (holder) return holder;
  const reserve = Object.values(BOOKS[chainId]?.ASSETS ?? {}).find((a) => a.UNDERLYING.toLowerCase() === token.toLowerCase());
  if (!reserve) throw new Error(`Belum ada holder ${token} chain ${chainId} untuk fork test`);
  return reserve.A_TOKEN;
}

export async function fundErc20(token: Address, to: Address, amount: bigint, clients?: ForkClients) {
  const { chainId, ...c } = clients ?? { chainId: 1, publicClient, testClient, walletClient };
  const holder = holderOf(chainId, token);
  // Anvil mengizinkan kirim tx atas nama holder tanpa private key.
  await sendAs(c, holder, () => c.walletClient.writeContract({ account: holder, chain: c.walletClient.chain, address: token, abi: erc20Abi, functionName: 'transfer', args: [to, amount] }));
}
