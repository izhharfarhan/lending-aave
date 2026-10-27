import { readFileSync } from 'node:fs';
import type { Address } from 'viem';

import { buildChainView, type ChainRead, type WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { chainSegment, summarizeChains, type ChainAccount } from './summary';

// Angka akun ditulis tangan (bentuk AccountView dari getUserAccountData), harapan dihitung tangan.
const account = (overrides: Partial<ChainAccount['account']>): ChainAccount['account'] => ({
  healthFactor: null,
  risk: null,
  totalCollateralUsd: 0,
  totalDebtUsd: 0,
  availableBorrowsUsd: 0,
  borrowLimitUsed: null,
  ...overrides,
});
const chain = (chainId: number, overrides: Partial<ChainAccount['account']>, totalSupplyUsd = 0): ChainAccount => ({
  chainId,
  account: account(overrides),
  totalSupplyUsd,
});
const ETHEREUM = 1;
const BASE = 8453;
const ARBITRUM = 42161;

describe('summarizeChains()', () => {
  describe('positive', () => {
    it('takes the lowest HF from chains with debt only', () => {
      const summary = summarizeChains([
        chain(ETHEREUM, { totalCollateralUsd: 50_000 }, 50_000),
        chain(BASE, { healthFactor: 1.8, risk: 'waspada', totalDebtUsd: 500 }),
        chain(ARBITRUM, { healthFactor: 2.4, risk: 'aman', totalDebtUsd: 100 }),
      ]);

      expect(summary.lowestHealthFactor).toEqual({ chainId: BASE, healthFactor: 1.8, risk: 'waspada' });
    });

    it('adds supply (collateral or not) and debt of every chain into totals and net', () => {
      const summary = summarizeChains([
        chain(ETHEREUM, { totalCollateralUsd: 10_000, totalDebtUsd: 2_500, healthFactor: 3.2, risk: 'aman' }, 10_000),
        // Supply $1.200 yang jaminannya dimatikan.
        chain(BASE, { totalCollateralUsd: 0 }, 1_200),
        chain(ARBITRUM, { totalCollateralUsd: 800, totalDebtUsd: 300, healthFactor: 2.2, risk: 'aman' }, 800),
      ]);

      expect(summary).toMatchObject({ totalSupplyUsd: 12_000, totalDebtUsd: 2_800, netUsd: 9_200 });
    });

    it('shows the borrow limit of the chain closest to its limit, not a total of all chains (Q24)', () => {
      // Total semua chain = 1.100 ÷ 11.000 = 10%, padahal Base sudah 82%.
      const summary = summarizeChains([
        chain(ETHEREUM, { healthFactor: 9, risk: 'aman', totalDebtUsd: 280, borrowLimitUsed: 0.035, availableBorrowsUsd: 7_720 }, 10_000),
        chain(BASE, { healthFactor: 1.6, risk: 'waspada', totalDebtUsd: 820, borrowLimitUsed: 0.82, availableBorrowsUsd: 180 }, 1_200),
        chain(ARBITRUM, {}, 0),
      ]);

      expect(summary.highestBorrowLimitUsed).toEqual({ chainId: BASE, used: 0.82, availableUsd: 180, risk: 'waspada' });
    });

    it('ranks debt left over zero-LTV collateral (limit used = ∞) as the highest', () => {
      const summary = summarizeChains([
        chain(ETHEREUM, { healthFactor: 1.2, risk: 'bahaya', totalDebtUsd: 900, borrowLimitUsed: 0.97, availableBorrowsUsd: 0 }, 1_000),
        chain(BASE, { healthFactor: 1.4, risk: 'bahaya', totalDebtUsd: 50, borrowLimitUsed: Infinity, availableBorrowsUsd: 0 }, 100),
      ]);

      expect(summary.highestBorrowLimitUsed).toMatchObject({ chainId: BASE, used: Infinity });
    });

    it('lists Bahaya chains lowest HF first, leaving Waspada out of the banner (Q2)', () => {
      const summary = summarizeChains([
        chain(ETHEREUM, { healthFactor: 1.45, risk: 'bahaya', totalDebtUsd: 900 }, 1_500),
        chain(BASE, { healthFactor: 1.6, risk: 'waspada', totalDebtUsd: 500 }, 1_000),
        chain(ARBITRUM, { healthFactor: 1.12, risk: 'bahaya', totalDebtUsd: 700 }, 900),
      ]);

      expect(summary.dangerChains.map((d) => d.chainId)).toEqual([ARBITRUM, ETHEREUM]);
    });
  });

  describe('positive: belum lengkap (Q4, Q24)', () => {
    it('marks the summary incomplete with the unread chain, so lowest HF and highest limit are only bounds', () => {
      const summary = summarizeChains(
        [
          chain(ETHEREUM, { healthFactor: 2.6, risk: 'aman', totalDebtUsd: 400, borrowLimitUsed: 0.3, availableBorrowsUsd: 900 }, 2_000),
          chain(ARBITRUM, { healthFactor: 1.7, risk: 'waspada', totalDebtUsd: 600, borrowLimitUsed: 0.6, availableBorrowsUsd: 400 }, 1_300),
        ],
        [{ chainId: BASE, lastRead: null }],
      );

      // HF terendah yang terbaca 1,7 → ditulis "≤ 1,7"; batas pinjam tertinggi 60% "bisa saja lebih tinggi".
      expect(summary.lowestHealthFactor).toMatchObject({ chainId: ARBITRUM, healthFactor: 1.7 });
      expect(summary.highestBorrowLimitUsed).toMatchObject({ chainId: ARBITRUM, used: 0.6 });
      expect(summary.incomplete).toEqual({ readCount: 2, totalCount: 3, unreadChains: [BASE] });
    });

    it('is never complete while a chain is unread, even when the read chains have no debt', () => {
      const summary = summarizeChains([chain(ETHEREUM, { totalCollateralUsd: 500 }, 500)], [
        { chainId: BASE, lastRead: null },
        { chainId: ARBITRUM, lastRead: null },
      ]);

      expect(summary.lowestHealthFactor).toBeNull();
      expect(summary.incomplete).toEqual({ readCount: 1, totalCount: 3, unreadChains: [BASE, ARBITRUM] });
    });
  });

  describe('positive: banner dari data terakhir (klarifikasi Q4)', () => {
    it('keeps a Bahaya chain in the banner from its last successful read, while the summary still counts it unread', () => {
      const READ_AT = 1_761_600_000_000;
      const summary = summarizeChains(
        [chain(ARBITRUM, { healthFactor: 1.44, risk: 'bahaya', totalDebtUsd: 1_400 }, 2_400)],
        [{ chainId: BASE, lastRead: { account: account({ healthFactor: 1.38, risk: 'bahaya', totalDebtUsd: 1_442 }), readAt: READ_AT } }],
      );

      // Banner: Base 1,38 dari data terakhir tetap paling depan; Arbitrum segar di belakangnya.
      expect(summary.dangerChains).toEqual([
        { chainId: BASE, healthFactor: 1.38, readAt: READ_AT },
        { chainId: ARBITRUM, healthFactor: 1.44, readAt: null },
      ]);
      // Ringkasan tetap tanpa Base: "≤ 1,44", Belum lengkap 1/2.
      expect(summary.lowestHealthFactor).toMatchObject({ chainId: ARBITRUM });
      expect(summary.totalDebtUsd).toBe(1_400);
      expect(summary.incomplete).toEqual({ readCount: 1, totalCount: 2, unreadChains: [BASE] });
    });

    it('leaves a stale chain that was not Bahaya out of the banner', () => {
      const summary = summarizeChains(
        [],
        [{ chainId: BASE, lastRead: { account: account({ healthFactor: 1.7, risk: 'waspada', totalDebtUsd: 500 }), readAt: 1 } }],
      );

      expect(summary.dangerChains).toEqual([]);
    });
  });

  describe('edge', () => {
    it('has no lowest HF, no borrow limit bar and no banner when no chain has debt', () => {
      const summary = summarizeChains([chain(ETHEREUM, { totalCollateralUsd: 2_000 }, 2_000), chain(BASE, {}, 0), chain(ARBITRUM, {}, 0)]);

      expect(summary).toEqual({
        lowestHealthFactor: null,
        totalSupplyUsd: 2_000,
        totalDebtUsd: 0,
        netUsd: 2_000,
        highestBorrowLimitUsed: null,
        dangerChains: [],
        incomplete: null,
      });
    });
  });
});

// Fixture asli Ethereum (lihat chainPosition.spec): akun `empty` tanpa posisi, saldo wallet diganti per kasus.
type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chainRead } = fixture;
const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WHITELIST: WhitelistAsset[] = [
  { address: WETH, symbol: 'ETH', native: true },
  { address: USDC, symbol: 'USDC', native: false },
  { address: USDT, symbol: 'USDT', native: false, requiresApprovalReset: true },
];
const viewOf = (label: string, walletBalances?: Record<Address, bigint>) =>
  buildChainView({ ...chainRead, user: { ...users[label], ...(walletBalances && { walletBalances }) } }, WHITELIST);
const GAS = { ethBalance: 10n ** 18n, typicalActionFee: 10n ** 15n };

describe('chainSegment()', () => {
  describe('positive', () => {
    it('shows a chain with supply or debt as a position', () => {
      expect(chainSegment(viewOf('noDebt'), GAS)).toMatchObject({ kind: 'position' });
      expect(chainSegment(viewOf('waspada'), GAS)).toMatchObject({ kind: 'position' });
    });

    it('offers the largest wallet balance (in USD) that can be supplied on a chain without a position (Q21)', () => {
      // 3.000 USDC > 0,1 ETH; 2 ETH > 100 USDC.
      expect(chainSegment(viewOf('empty', { [WETH]: 10n ** 17n, [USDC]: 3_000_000_000n, [USDT]: 0n }), GAS)).toEqual({
        kind: 'empty',
        largestWallet: { symbol: 'USDC', amount: 3_000_000_000n, decimals: 6 },
        ethShort: false,
      });
      expect(chainSegment(viewOf('empty', { [WETH]: 2n * 10n ** 18n, [USDC]: 100_000_000n, [USDT]: 0n }), GAS)).toMatchObject({
        largestWallet: { symbol: 'ETH', amount: 2n * 10n ** 18n, decimals: 18 },
      });
    });

    it('flags ETH below the typical cost of one Aave action (Q10)', () => {
      const view = viewOf('noDebt');
      expect(chainSegment(view, { ethBalance: 5n * 10n ** 14n, typicalActionFee: 10n ** 15n }).ethShort).toBe(true);
      expect(chainSegment(view, { ethBalance: 2n * 10n ** 15n, typicalActionFee: 10n ** 15n }).ethShort).toBe(false);
    });
  });

  describe('edge', () => {
    it('writes just "Belum ada posisi" when the wallet holds nothing to supply', () => {
      expect(chainSegment(viewOf('empty', { [WETH]: 0n, [USDC]: 0n, [USDT]: 0n }), GAS)).toMatchObject({ kind: 'empty', largestWallet: null });
    });

    it('flags ETH 0 even before the fee estimate arrives, and nothing else without an estimate', () => {
      const view = viewOf('noDebt');
      expect(chainSegment(view, { ethBalance: 0n, typicalActionFee: null }).ethShort).toBe(true);
      expect(chainSegment(view, { ethBalance: 1n, typicalActionFee: null }).ethShort).toBe(false);
    });
  });
});
