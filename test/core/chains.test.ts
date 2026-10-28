import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { forkStartBlock, INDEXED_CHAINS } from '../../src/chains';

// Blok pin indexer harus sama dengan Anvil lending-web (repo bersebelahan, README): kalau pin di sana pindah, start
// block fork di sini ikut salah tanpa ketahuan.
const webForkChains = JSON.parse(readFileSync(new URL('../../../lending-web/src/config/forkChains.json', import.meta.url), 'utf8')) as Record<string, { forkBlock: number }>;

describe('INDEXED_CHAINS', () => {
  it.each(Object.keys(INDEXED_CHAINS).map(Number) as (keyof typeof INDEXED_CHAINS)[])('pins chain %i at the same block as lending-web', (chainId) => {
    expect(INDEXED_CHAINS[chainId].pinBlock).toBe(webForkChains[chainId]!.forkBlock);
  });

  // DECISIONS Q31: fork mulai sesudah pin, tanpa backfill.
  it('starts the fork index right after the pin', () => {
    expect(forkStartBlock(1)).toBe(26_282_001);
  });
});
