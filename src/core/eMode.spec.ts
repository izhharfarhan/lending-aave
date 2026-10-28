import { readFileSync } from 'node:fs';
import type { Address } from 'viem';

import { buildChainView, type ChainRead, type EModeRead, type WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { accountFromReserves, liquidationPrice, simulate } from './simulate';

// Test wajib Q13 untuk E-Mode (aturan V4 = `getUserReserveLtv` + GenericLogic v3.7). Fixture asli tanpa E-Mode; kategori
// di bawah dipasang ke posisi yang sama, jadi selisihnya cuma dari E-Mode.
type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chain } = fixture;
const read = (label: string, eMode: EModeRead | null = null): ChainRead => ({ ...chain, user: { ...users[label], eMode } });
const withReserve = (base: ChainRead, asset: Address, flags: object): ChainRead => ({
  ...base,
  reserves: base.reserves.map((r) => (r.underlyingAsset === asset ? { ...r, ...flags } : r)),
});

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const TBTC: Address = '0x18084fbA666a33d37592fA2633fD49a74DD93a88';
const WHITELIST: WhitelistAsset[] = [
  { address: WETH, symbol: 'ETH', native: true },
  { address: USDC, symbol: 'USDC', native: false },
  { address: USDT, symbol: 'USDT', native: false, requiresApprovalReset: true },
];
// Id reserve di blok pin: WETH 0, USDC 3, USDT 8, tBTC 33.
const bit = (id: number) => 1n << BigInt(id);
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
const base = (value: bigint) => Number(value) / 1e8;

// Kategori ala "ETH correlated": jaminan ETH (LTV 93%, LT 95%), pinjaman ETH + USDC.
const ETH_CATEGORY: EModeRead = {
  id: 1,
  label: 'ETH correlated',
  ltv: 9300n,
  liquidationThreshold: 9500n,
  collateralBitmap: bit(0),
  borrowableBitmap: bit(0) | bit(3),
  ltvzeroBitmap: 0n,
  isolated: false,
};

describe('E-Mode (V4)', () => {
  describe('positive: simulasi dengan E-Mode aktif dan nonaktif', () => {
    // Jaminan ETH $13.148,60476537, utang USDC $1.999,60115935; borrow 1.000 USDC menambah utang $999,79651.
    it.each([
      // Nonaktif: LT/LTV reserve 83% / 80,5%.
      ['nonaktif', null, { hf: 3.638511, available: 7_585.229, liquidation: 633.987 }],
      // Aktif: 13.148,60 × 0,95 ÷ 2.999,40 = 4,164561; sisa = 13.148,60 × 0,93 − 2.999,40 = 9.228,80; ETH = 2.306,77 ÷ HF.
      ['aktif', ETH_CATEGORY, { hf: 4.164561, available: 9_228.805, liquidation: 553.905 }],
    ] as const)('borrow 1.000 USDC with E-Mode %s: HF, remaining borrow limit and liquidation price', (_label, eMode, expected) => {
      const sim = simulate(read('ethCollateralUsdcDebt', eMode), WHITELIST, { action: 'borrow', asset: USDC, amount: usdc(1_000) });

      expect(sim.account.healthFactor).toBeCloseTo(expected.hf, 4);
      expect(sim.account.availableBorrowsUsd).toBeCloseTo(expected.available, 1);
      expect(sim.liquidation).toMatchObject({ kind: 'price', dir: 'turun', price: expect.closeTo(expected.liquidation, 1) });
    });
  });

  describe('edge case: aset di luar collateralBitmap, ltvzeroBitmap, kategori isolated', () => {
    // Posisi Bahaya: jaminan ETH ±$3.576,42 (di bitmap) + tBTC ±$30.640,00 (di luar; LTV 73%, LT 78%), utang $20.646,08.
    it('uses the category LT/LTV for ETH and the reserve LT/LTV for tBTC outside the bitmap', () => {
      const account = accountFromReserves(read('bahayaWithOutsideAssets', ETH_CATEGORY));

      // HF = (3.576,42 × 0,95 + 30.640,00 × 0,78) ÷ 20.646,08 = 1,3221 (tanpa E-Mode 1,3013).
      expect(Number(account.healthFactor) / 1e18).toBeCloseTo(1.3221, 3);
      // 3.576,42 × 0,93 + 30.640,00 × 0,73 − 20.646,08 = 5.047,19.
      expect(base(account.availableBorrowsBase)).toBeCloseTo(5_047.19, -1);
    });

    it('gives LTV 0 to collateral outside the bitmap of an isolated category, without touching HF', () => {
      const isolated = read('bahayaWithOutsideAssets', { ...ETH_CATEGORY, isolated: true });
      const account = accountFromReserves(isolated);

      expect(Number(account.healthFactor) / 1e18).toBeCloseTo(1.3221, 3);
      // 3.576,42 × 0,93 jauh di bawah utang: nggak ada sisa batas pinjam, borrow apa pun dikunci.
      expect(account.availableBorrowsBase).toBe(0n);
      expect(simulate(isolated, WHITELIST, { action: 'borrow', asset: USDC, amount: usdc(1) }).gate).toBe('locked');
    });

    it('gives LTV 0 to an asset in ltvzeroBitmap, and makes it the collateral to withdraw first', () => {
      const ltvZero = read('bahayaWithOutsideAssets', { ...ETH_CATEGORY, ltvzeroBitmap: bit(0) });

      // Sisa batas pinjam cuma dari tBTC: 30.640,00 × 0,73 − 20.646,08 = 1.721,12; LT ETH tetap 95%.
      expect(base(accountFromReserves(ltvZero).availableBorrowsBase)).toBeCloseTo(1_721.12, -1);
      expect(Number(accountFromReserves(ltvZero).healthFactor) / 1e18).toBeCloseTo(1.3221, 3);
      expect(simulate(ltvZero, WHITELIST, { action: 'withdraw', asset: TBTC, amount: 1n }).ltvZero).toBe(true);
      expect(simulate(ltvZero, WHITELIST, { action: 'withdraw', asset: WETH, amount: 1n }).ltvZero).toBe(false);
    });

    it('does not turn a first supply with LTV 0 in E-Mode into collateral, and says it cannot be collateral', () => {
      // USDC jaminan $266.443,38 (di luar bitmap kategori isolated → LTV 0, LT reserve tetap); supply USDT pertama.
      const isolated = read('noDebt', { ...ETH_CATEGORY, isolated: true });
      const before = accountFromReserves(isolated).totalCollateralBase;

      const sim = simulate(isolated, WHITELIST, { action: 'supply', asset: USDT, amount: usdc(1_000) });
      expect(sim.account.totalCollateralUsd).toBeCloseTo(base(before), 2);

      const view = buildChainView(isolated, WHITELIST);
      expect(view.supplyMarket.map((r) => [r.symbol, r.canBeCollateral])).toEqual([
        ['ETH', true],
        ['USDC', false],
        ['USDT', false],
      ]);
      expect(view.supplies.find((r) => r.symbol === 'USDC')?.canBeCollateral).toBe(false);
    });
  });

  describe('edge case: harga likuidasi dan Pasar pinjam', () => {
    // Jaminan ETH, utang USDC. LT ETH: kategori 95% kalau di bitmap → harga = 2.306,77 ÷ (13.148,60 × 0,95 ÷ 1.999,60)
    // = $369,27; di luar bitmap LT reserve 83% → 2.306,77 ÷ 5,457759 = $422,66. ltvzero/isolated nggak mengubah LT.
    it.each([
      ['ETH di bitmap', ETH_CATEGORY, 369.27],
      ['ETH di ltvzeroBitmap', { ...ETH_CATEGORY, ltvzeroBitmap: bit(0) }, 369.27],
      ['kategori isolated', { ...ETH_CATEGORY, isolated: true }, 369.27],
      ['ETH di luar bitmap', { ...ETH_CATEGORY, collateralBitmap: bit(3) }, 422.66],
    ] as const)('prices liquidation with the effective LT: %s', (_label, eMode, price) => {
      expect(liquidationPrice(read('ethCollateralUsdcDebt', eMode), WHITELIST)).toMatchObject({ kind: 'price', price: expect.closeTo(price, 1) });
    });

    it.each([
      ['ltvzeroBitmap', { ...ETH_CATEGORY, ltvzeroBitmap: bit(0) }],
      ['isolated', { ...ETH_CATEGORY, isolated: true }],
    ] as const)('keeps Pasar pinjam = borrowableBitmap with %s (they only touch LTV)', (_label, eMode) => {
      expect(buildChainView(read('noDebt', eMode), WHITELIST).borrowMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC']);
    });
  });

  describe('keterangan read-only', () => {
    it('describes the category by what it holds (whitelist names first, then outside assets), keeping the label for detail', () => {
      const eMode = { ...ETH_CATEGORY, collateralBitmap: bit(0) | bit(33), borrowableBitmap: bit(0) | bit(3) };

      expect(buildChainView(read('noDebt', eMode), WHITELIST).eMode).toEqual({
        label: 'ETH correlated',
        collateral: ['ETH', 'tBTC'],
        borrowable: ['ETH', 'USDC'],
      });
    });

    it('has no E-Mode line outside E-Mode or before connecting', () => {
      expect(buildChainView(read('noDebt'), WHITELIST).eMode).toBeNull();
      expect(buildChainView({ ...chain, user: null }, WHITELIST).eMode).toBeNull();
    });
  });

  describe('filter Pasar pinjam', () => {
    it('lists borrowingEnabled reserves outside E-Mode', () => {
      expect(buildChainView(read('noDebt'), WHITELIST).borrowMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC', 'USDT']);
    });

    it('lists only borrowableBitmap in E-Mode, ignoring borrowingEnabled, and still hides frozen reserves', () => {
      const eMode = { ...ETH_CATEGORY, borrowableBitmap: bit(0) | bit(8) };
      const notEnabled = withReserve(read('noDebt', eMode), USDT, { borrowingEnabled: false });
      expect(buildChainView(notEnabled, WHITELIST).borrowMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDT']);

      const frozen = withReserve(read('noDebt', eMode), WETH, { isFrozen: true });
      expect(buildChainView(frozen, WHITELIST).borrowMarket.map((r) => r.symbol)).toEqual(['USDT']);
    });
  });
});
