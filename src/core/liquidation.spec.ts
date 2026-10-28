import type { Address, Hash } from 'viem';

import type { IndexedHistoryEntry, LiquidationDetail } from './history';
import { bannerLiquidations, dismissKey, liquidationFacts, liquidationOutcome, type IndexedLiquidation } from './liquidation';

const WETH: Address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC: Address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const DAY = 86_400;
const T = 1_793_079_527;
const HASH: Hash = '0x9f3c0a6e2b7d41c5aa10b2f4e6d8c0b1a3e5f7092d4b6c8e0f1a3b5c7d9e0a41b';

const detail = (overrides: Partial<LiquidationDetail> = {}): LiquidationDetail => ({
  debtAsset: USDC,
  debtToCover: 1_000_000_000n,
  liquidatedCollateralAmount: 1_045_000_000_000_000_000n,
  protocolFee: 5_000_000_000_000_000n,
  liquidationBonus: 10_500,
  bonusFromEMode: false,
  eModeCategory: 0,
  penalty: 50_000_000_000_000_000n,
  collateralPrice: 1_100_00000000n,
  healthFactorBefore: 970_000_000_000_000_000n,
  deficits: [],
  ...overrides,
});

const liquidation = (overrides: Partial<IndexedLiquidation> = {}): IndexedLiquidation => ({
  chainId: 1,
  txHash: HASH,
  logIndex: 9,
  kind: 'liquidation',
  reserve: WETH,
  amount: 1_050_000_000_000_000_000n,
  collateralEnabled: null,
  timestamp: T,
  blockNumber: 26_282_010n,
  liquidation: detail(),
  ...overrides,
});

describe('bannerLiquidations()', () => {
  const latest = (byChain: Record<number, number | null>) => (chainId: number) => byChain[chainId] ?? null;

  it('shows a liquidation up to 30 days old, measured from the latest block of its own chain (Q30)', () => {
    const recent = liquidation({ timestamp: T - 30 * DAY });
    const old = liquidation({ chainId: 8453, timestamp: T - 30 * DAY - 1 });
    // Arbitrum "maju waktu" 40 hari: likuidasi kemarin (jam perangkat) sudah lewat 30 hari menurut jam chain-nya.
    const advanced = liquidation({ chainId: 42161, timestamp: T - DAY });

    const shown = bannerLiquidations([recent, old, advanced], {
      latestBlockTimestamp: latest({ 1: T, 8453: T, 42161: T + 40 * DAY }),
      dismissed: new Set(),
    });

    expect(shown).toEqual([recent]);
  });

  it('skips liquidations the user closed on this device, whatever the hash casing', () => {
    const closed = liquidation();
    const other = liquidation({ logIndex: 20 });

    const shown = bannerLiquidations([closed, other], {
      latestBlockTimestamp: latest({ 1: T }),
      dismissed: new Set([dismissKey({ ...closed, txHash: HASH.toUpperCase().replace('0X', '0x') as Hash })]),
    });

    expect(shown).toEqual([other]);
  });

  it('ignores other history rows and chains whose latest block is unknown', () => {
    const supply: IndexedHistoryEntry = { ...liquidation(), kind: 'supply', liquidation: null };
    const unknownChain = liquidation({ chainId: 8453 });

    expect(bannerLiquidations([supply, unknownChain], { latestBlockTimestamp: latest({ 1: T }), dismissed: new Set() })).toEqual([]);
  });
});

describe('liquidationFacts()', () => {
  it('values the collateral lost and the penalty at the oracle price of the liquidation block', () => {
    const facts = liquidationFacts(liquidation(), 18);

    expect(facts.collateralLost).toEqual({ amount: 1_050_000_000_000_000_000n, usd: 1155 });
    expect(facts.debtRepaid).toBe(1_000_000_000n);
    // Penalti = bonus − 100% (sama dengan "Liquidation penalty" di Detail parameter).
    expect(facts.penalty).toEqual({ amount: 50_000_000_000_000_000n, usd: 55, percent: 0.05 });
    expect(facts.healthFactorBefore).toBeCloseTo(0.97, 10);
  });

  it('still reports amounts, penalty percent and health factor before the collateral decimals are known', () => {
    expect(liquidationFacts(liquidation(), null)).toMatchObject({
      collateralLost: { amount: 1_050_000_000_000_000_000n, usd: null },
      penalty: { amount: 50_000_000_000_000_000n, usd: null, percent: 0.05 },
      debtRepaid: 1_000_000_000n,
    });
  });

  it('keeps the health factor before liquidation unavailable when the indexer could not read it (Q16)', () => {
    expect(liquidationFacts(liquidation({ liquidation: detail({ healthFactorBefore: null }) }), 18).healthFactorBefore).toBeNull();
  });

  it('tells a partial liquidation apart from one that sold all of that collateral or wrote off the remaining debt', () => {
    expect(liquidationOutcome(liquidation())).toBe('partial');
    expect(liquidationOutcome(liquidation({ collateralEnabled: false }))).toBe('collateralSold');
    const deficit = liquidation({
      collateralEnabled: false,
      liquidation: detail({ deficits: [{ debtAsset: USDC, amount: 400_000_000n }] }),
    });
    expect(liquidationOutcome(deficit)).toBe('debtWrittenOff');
  });
});
