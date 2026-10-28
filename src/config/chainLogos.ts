import type { LogoFile } from './tokenLogos';

/**
 * Logo chain, file lokal di `public/chains/` (sumber: README di folder itu), menggantikan inisial E/B/A. Sama seperti
 * logo token: nggak pernah dari URL luar saat runtime. Berlian Ethereum bukan bidang penuh, jadi diberi alas terang.
 */
export const CHAIN_LOGOS: Record<number, LogoFile> = {
  1: { src: '/chains/ethereum.svg', plate: true },
  8453: { src: '/chains/base.svg' },
  42161: { src: '/chains/arbitrum.svg' },
};

/** `null` = chain tanpa logo: tampil inisial. */
export const chainLogo = (chainId: number): LogoFile | null => CHAIN_LOGOS[chainId] ?? null;
