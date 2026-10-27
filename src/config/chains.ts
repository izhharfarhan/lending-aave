export type SupportedChain = {
  chainId: number;
  slug: string;
  name: string;
  /**
   * Lantai cadangan gas MAX supply/repay ETH, wei (pola `maxSpendable` swap-web tiket 14: Ethereum 0,0005 ETH, L2
   * 0,00005 ETH). Gas mahal sudah ketutup `biaya × 2`.
   */
  minGasReserve: bigint;
};

// Tiket 01: Ethereum dulu. Base & Arbitrum masuk di tiket 10 (nambah chain = nambah satu entri).
export const SUPPORTED_CHAINS: SupportedChain[] = [{ chainId: 1, slug: 'ethereum', name: 'Ethereum', minGasReserve: 500_000_000_000_000n }];

export function minGasReserve(chainId: number): bigint {
  const chain = SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
  if (!chain) throw new Error(`Chain ${chainId} belum didukung`);
  return chain.minGasReserve;
}

export function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((c) => c.chainId === chainId)?.name ?? `chain ${chainId}`;
}
