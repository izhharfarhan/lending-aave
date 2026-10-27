export type SupportedChain = { chainId: number; slug: string; name: string };

// Tiket 01: Ethereum dulu. Base & Arbitrum masuk di tiket 10 (nambah chain = nambah satu entri).
export const SUPPORTED_CHAINS: SupportedChain[] = [{ chainId: 1, slug: 'ethereum', name: 'Ethereum' }];

export function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((c) => c.chainId === chainId)?.name ?? `chain ${chainId}`;
}
