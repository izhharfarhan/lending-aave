import { isAddressEqual, type Address } from 'viem';

import { useAllChainViews } from '@/aave/useChainView';
import { WHITELIST } from '@/config/assets';
import { SUPPORTED_CHAINS } from '@/config/chains';

export type TokenInfo = { symbol: string; decimals: number | null };
export type TokenLookup = (chainId: number, reserve: Address) => TokenInfo | null;

// Simbol & desimal reserve dari bacaan chain dashboard (semua reserve, termasuk aset luar). Simbol whitelist menang
// (WETH tampil sebagai ETH). Bacaan chain belum ada = jumlah belum bisa diformat.
export function useTokenLookup(): TokenLookup {
  const views = useAllChainViews();
  return (chainId, reserve) => {
    const whitelisted = WHITELIST[chainId]?.find((asset) => isAddressEqual(asset.address, reserve));
    const read = views[SUPPORTED_CHAINS.findIndex((chain) => chain.chainId === chainId)]?.data?.read;
    const onChain = read?.reserves.find((r) => isAddressEqual(r.underlyingAsset, reserve));
    const symbol = whitelisted?.symbol ?? onChain?.symbol;
    return symbol ? { symbol, decimals: onChain ? Number(onChain.decimals) : null } : null;
  };
}
