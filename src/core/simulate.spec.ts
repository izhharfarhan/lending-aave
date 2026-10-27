import { readFileSync } from 'node:fs';
import type { Address } from 'viem';

import type { ChainRead, WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { accountFromReserves, confirmationGate, liquidationPrice, repayPlan, simulate } from './simulate';

// Fixture asli yang sama dengan chainPosition.spec (Ethereum blok pin 26.282.000, akun mainnet nyata).
type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chain } = fixture;
const read = (label: string): ChainRead => ({ ...chain, user: users[label] });
const withReserve = (base: ChainRead, asset: Address, flags: Partial<ChainRead['reserves'][number]>): ChainRead => ({
  ...base,
  reserves: base.reserves.map((r) => (r.underlyingAsset === asset ? { ...r, ...flags } : r)),
});
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
const eth = (n: number) => BigInt(n) * 10n ** 18n;
// Harga oracle di blok pin: ETH $2.306,77, USDC $0,99979651.

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WHITELIST: WhitelistAsset[] = [
  { address: WETH, symbol: 'ETH', native: true },
  { address: USDC, symbol: 'USDC', native: false },
  { address: USDT, symbol: 'USDT', native: false, requiresApprovalReset: true },
];

describe('accountFromReserves()', () => {
  describe('positive', () => {
    // Parity tanpa toleransi: getUserAccountData di fixture dibaca di blok yang sama dengan data per reserve.
    it.each(Object.keys(users))('equals getUserAccountData exactly for the real %s position', (label) => {
      expect(accountFromReserves(read(label))).toEqual(users[label].account);
    });
  });
});

// Angka harapan dihitung tangan dari getUserAccountData fixture: posisi ethCollateralUsdcDebt = jaminan ETH
// $13.148,60476537 (LT 83%, LTV 80,5%) + utang USDC $1.999,60115935. Contoh: borrow 1.000 USDC menambah utang
// $999,79651 → HF = 13.148,60 × 0,83 ÷ 2.999,40 = 3,638511.
describe('simulate()', () => {
  describe('positive: borrow', () => {
    it('shows HF, remaining borrow limit and liquidation price after borrowing a stablecoin', () => {
      const sim = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'borrow', asset: USDC, amount: usdc(1_000) });

      expect(sim.account.healthFactor).toBeCloseTo(3.638511, 5);
      expect(sim.account.availableBorrowsUsd).toBeCloseTo(7_585.229, 2);
      expect(sim.account.totalDebtUsd).toBeCloseTo(2_999.39767, 4);
      // Jaminan cuma ETH, utang cuma stable: harga likuidasi = harga ETH ÷ HF.
      expect(sim.liquidation).toEqual({ kind: 'price', dir: 'turun', price: expect.closeTo(633.987, 2), pct: expect.closeTo(-0.72516, 4) });
      expect(sim.overLtv).toBe(false);
      expect(sim.gate).toBe('none');
    });

    it('turns a first ETH loan against stablecoin collateral into a rising liquidation price', () => {
      // Jaminan USDC $266.443,37919858 × LT 78% = $207.825,84 → HF 1 kalau 10 ETH bernilai segitu: $20.782,58/ETH.
      const sim = simulate(read('noDebt'), WHITELIST, { action: 'borrow', asset: WETH, amount: eth(10) });

      expect(sim.liquidation).toEqual({ kind: 'price', dir: 'naik', price: expect.closeTo(20_782.58, 1), pct: expect.closeTo(8.0094, 3) });
    });
  });

  describe('positive: repay', () => {
    it('raises HF and lowers the liquidation price after a partial repay', () => {
      const sim = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'repay', asset: USDC, amount: usdc(500) });

      expect(sim.account.healthFactor).toBeCloseTo(7.277003, 4);
      expect(sim.liquidation).toMatchObject({ kind: 'price', dir: 'turun', price: expect.closeTo(316.99, 1) });
      expect(sim.gate).toBe('none');
    });

    it('clears the debt when repaying more than is owed (the Pool only takes the debt)', () => {
      const sim = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'repay', asset: USDC, amount: usdc(5_000) });

      expect(sim.account.healthFactor).toBeNull();
      expect(sim.account.totalDebtUsd).toBe(0);
      expect(sim.liquidation).toEqual({ kind: 'noDebt' });
    });
  });

  describe('negative: tier #9', () => {
    // Batas pinjam $8.585,02567677 ÷ $0,99979651 = 8.586,77 USDC.
    it('locks a borrow just past the LTV limit and asks to type "confirm" just below it', () => {
      const over = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'borrow', asset: USDC, amount: usdc(8_587) });
      const under = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'borrow', asset: USDC, amount: usdc(8_586) });

      expect(over).toMatchObject({ overLtv: true, gate: 'locked' });
      expect(under).toMatchObject({ overLtv: false, gate: 'type' });
      expect(under.account.healthFactor).toBeCloseTo(1.0312, 3);
    });

    it('warns at HF 1,5–2,0 and asks for a checkbox at HF 1,1–1,5', () => {
      // Utang yang bikin HF = 1,8 → $6.063 (borrow ≈ 4.063 USDC); HF = 1,3 → $8.395 (≈ 6.396 USDC).
      expect(simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'borrow', asset: USDC, amount: usdc(4_063) }).gate).toBe('warn');
      expect(simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'borrow', asset: USDC, amount: usdc(6_396) }).gate).toBe('check');
    });

    it('never asks for confirmation on a repay, even on a position already past its LTV limit', () => {
      // Harga ETH turun 50%: HF waspada 1,88 → 0,94, utang sudah melewati batas LTV.
      const dropped = withReserve(read('waspada'), WETH, { priceInMarketReferenceCurrency: 115_338_500_000n });

      const sim = simulate(dropped, WHITELIST, { action: 'repay', asset: USDC, amount: usdc(10) });
      expect(sim.overLtv).toBe(true);
      expect(sim.gate).toBe('none');
    });
  });
});

describe('confirmationGate()', () => {
  it('maps HF after the action to the #9 tiers, with exact boundaries', () => {
    expect(confirmationGate(2, false)).toBe('none');
    expect(confirmationGate(1.9999, false)).toBe('warn');
    expect(confirmationGate(1.5, false)).toBe('warn');
    expect(confirmationGate(1.4999, false)).toBe('check');
    expect(confirmationGate(1.1, false)).toBe('check');
    expect(confirmationGate(1.0999, false)).toBe('type');
    expect(confirmationGate(null, false)).toBe('none');
    expect(confirmationGate(3, true)).toBe('locked');
  });
});

describe('liquidationPrice()', () => {
  describe('positive', () => {
    it('gives the ETH price at which HF reaches 1, labelled against the current oracle price', () => {
      // HF 5,457759 → $2.306,77 ÷ 5,457759 = $422,66 (−81,68%).
      expect(liquidationPrice(read('ethCollateralUsdcDebt'), WHITELIST)).toEqual({
        kind: 'price',
        dir: 'turun',
        price: expect.closeTo(422.659, 2),
        pct: expect.closeTo(-0.81677, 4),
      });
    });
  });

  describe('edge case', () => {
    it('is not affected by the ETH price when ETH is on both sides and nothing else matters', () => {
      // Jaminan ETH + 744 unit USDT, utang ETH: HF ≈ konstan terhadap harga ETH.
      expect(liquidationPrice(read('ethDebtOutsideNonCollateral'), WHITELIST)).toEqual({ kind: 'none' });
    });

    it('refuses to give a number when another volatile asset (outside the whitelist) counts', () => {
      // Jaminan tBTC + utang GHO, keduanya aset luar.
      expect(liquidationPrice(read('bahayaWithOutsideAssets'), WHITELIST)).toEqual({ kind: 'mixed' });
    });

    it('says there is no debt, and says liquidation is possible now once HF < 1', () => {
      expect(liquidationPrice(read('noDebt'), WHITELIST)).toEqual({ kind: 'noDebt' });
      expect(liquidationPrice(read('empty'), WHITELIST)).toEqual({ kind: 'noDebt' });
      // Harga ETH turun 50%: HF waspada 1,88 → 0,94.
      const crashed = withReserve(read('waspada'), WETH, { priceInMarketReferenceCurrency: 115_338_500_000n });
      expect(liquidationPrice(crashed, WHITELIST)).toEqual({ kind: 'now' });
    });
  });
});

describe('repayPlan()', () => {
  const debt = usdc(1_000);
  // Bantalan = bunga 1 hari pada APR pinjaman 4,4795% → 1.000 × 0,044795 ÷ 365 = 0,122726 USDC.
  const rate = 44_794_710_292_724_102_718_356_564n;

  it('repays in full with type(uint256).max and a cushioned allowance when the wallet covers debt + cushion', () => {
    expect(repayPlan({ debt, balance: usdc(1_000.2), amount: debt, variableBorrowRate: rate })).toEqual({
      full: true,
      send: 2n ** 256n - 1n,
      spend: 1_000_122_726n,
    });
  });

  it('still repays in full when the typed amount trails the debt by less than the cushion (interest since the read)', () => {
    // Utang yang terlihat di panel sudah tertinggal bunga beberapa detik saat tx dikirim.
    expect(repayPlan({ debt, balance: usdc(1_000.2), amount: debt - 50_000n, variableBorrowRate: rate })).toMatchObject({ full: true });
    expect(repayPlan({ debt, balance: usdc(1_000.2), amount: debt - 200_000n, variableBorrowRate: rate })).toMatchObject({ full: false });
  });

  it('repays exactly the typed amount otherwise, so a full-debt amount without cushion may leave interest dust', () => {
    expect(repayPlan({ debt, balance: usdc(1_000.1), amount: debt, variableBorrowRate: rate })).toEqual({
      full: false,
      send: debt,
      spend: debt,
    });
    expect(repayPlan({ debt, balance: usdc(5_000), amount: usdc(400), variableBorrowRate: rate })).toEqual({
      full: false,
      send: usdc(400),
      spend: usdc(400),
    });
  });
});
