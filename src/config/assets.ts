import type { WhitelistAsset } from '@/core/chainPosition';
import { SUPPORTED_CHAINS } from './chains';

// Whitelist per chain; sumbernya entri `SUPPORTED_CHAINS` (aturannya di `SupportedChain.whitelist`).
export const WHITELIST: Record<number, WhitelistAsset[]> = Object.fromEntries(SUPPORTED_CHAINS.map((c) => [c.chainId, c.whitelist]));
