import { readFileSync } from 'node:fs';
import type { Address } from 'viem';

import { buildChainView, type ChainRead, type WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { rescueOptions } from './rescue';

type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chain } = fixture;
const read = (label: string): ChainRead => ({ ...chain, user: users[label] });
const withWallet = (label: string, balances: Record<Address, bigint>): ChainRead => {
  const base = read(label);
  return { ...base, user: { ...base.user!, walletBalances: { ...base.user!.walletBalances, ...balances } } };
};
const withReserve = (base: ChainRead, asset: Address, flags: object): ChainRead => ({
  ...base,
  reserves: base.reserves.map((r) => (r.underlyingAsset === asset ? { ...r, ...flags } : r)),
});

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WHITELIST: WhitelistAsset[] = [
  { address: WETH, symbol: 'ETH', native: true },
  { address: USDC, symbol: 'USDC', native: false },
  { address: USDT, symbol: 'USDT', native: false, requiresApprovalReset: true },
];
const GAS = { minGasReserve: 500_000_000_000_000n, networkFee: null };
const options = (r: ChainRead) => rescueOptions(r, buildChainView(r, WHITELIST), WHITELIST, GAS);

// Posisi Bahaya asli (HF 1,3013): jaminan $34.216,41 × LT rata-rata 78,52%, utang $20.646,08 (USDC + GHO luar
// whitelist). Wallet 200 USDC + 0,01006 ETH. Harga USDC $0,99979651, LT USDC 78%.
describe('rescueOptions()', () => {
  describe('positive', () => {
    it('gives HF after repaying MAX: the whole wallet balance when it does not cover the debt', () => {
      // 34.216,41 × 0,7852 ÷ (20.646,08 − 200 × 0,99979651) = 1,3140.
      expect(options(read('bahayaWithOutsideAssets')).repay).toEqual({
        tab: 'repay',
        asset: USDC,
        symbol: 'USDC',
        decimals: 6,
        amount: 200_000_000n,
        healthFactor: expect.closeTo(1.314, 3),
      });
    });

    it('gives HF after supplying the wallet collateral that raises HF most', () => {
      // 200 USDC ($155,97 × LT) mengalahkan 0,00956 ETH (saldo − cadangan gas ±$22):
      // (34.216,41 × 0,7852 + 200 × 0,99979651 × 0,78) ÷ 20.646,08 = 1,3089.
      expect(options(read('bahayaWithOutsideAssets')).supply).toEqual({
        tab: 'supply',
        asset: USDC,
        symbol: 'USDC',
        decimals: 6,
        amount: 200_000_000n,
        healthFactor: expect.closeTo(1.3089, 3),
      });
    });

    it('supplies ETH minus the gas reserve when ETH helps most', () => {
      const supply = options(withWallet('bahayaWithOutsideAssets', { [WETH]: 10n ** 18n })).supply;

      // 1 ETH − cadangan 0,0005 ETH = 0,9995 ETH × $2.306,77 × LT 83% menambah ±0,0927 ke HF.
      expect(supply).toMatchObject({ asset: WETH, symbol: 'ETH', amount: 999_500_000_000_000_000n, healthFactor: expect.closeTo(1.394, 2) });
    });

    it('says the debt is gone when MAX repay pays it off in full', () => {
      const repay = options(withWallet('ethCollateralUsdcDebt', { [USDC]: 5_000_000_000n })).repay;

      expect(repay).toMatchObject({ asset: USDC, healthFactor: null });
      expect(repay!.amount).toBeGreaterThan(1_999_000_000n);
    });
  });

  describe('negative', () => {
    it('has no option when the wallet holds nothing that helps', () => {
      const empty = withWallet('bahayaWithOutsideAssets', { [WETH]: 0n, [USDC]: 0n, [USDT]: 0n });

      expect(options(empty)).toEqual({ repay: null, supply: null });
    });

    it('skips a supply that would not count as collateral (LTV 0)', () => {
      const ltvZero = withReserve(withWallet('bahayaWithOutsideAssets', { [WETH]: 0n }), USDC, { baseLTVasCollateral: 0n });

      expect(options(ltvZero).supply).toBeNull();
    });

    it('skips repaying a paused reserve (the contract rejects every action)', () => {
      const paused = withReserve(read('bahayaWithOutsideAssets'), USDC, { isPaused: true });

      expect(options(paused).repay).toBeNull();
    });
  });
});
