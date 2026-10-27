import { readFileSync } from 'node:fs';
import type { Address } from 'viem';

import type { ChainRead, WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { accountFromReserves, confirmationGate, liquidationPrice, repayPlan, simulate, withdrawPlan } from './simulate';

// Fixture asli yang sama dengan chainPosition.spec (Ethereum blok pin 26.282.000, akun mainnet nyata).
type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chain } = fixture;
const read = (label: string): ChainRead => ({ ...chain, user: users[label] });
const withReserve = (base: ChainRead, asset: Address, flags: Partial<ChainRead['reserves'][number]>): ChainRead => ({
  ...base,
  reserves: base.reserves.map((r) => (r.underlyingAsset === asset ? { ...r, ...flags } : r)),
});
const withUserReserve = (base: ChainRead, asset: Address, fields: Partial<NonNullable<ChainRead['user']>['reserves'][number]>): ChainRead => ({
  ...base,
  user: { ...base.user!, reserves: base.user!.reserves.map((r) => (r.underlyingAsset === asset ? { ...r, ...fields } : r)) },
});
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
const eth = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;
// Harga oracle di blok pin: ETH $2.306,77, USDC $0,99979651.

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const TBTC: Address = '0x18084fbA666a33d37592fA2633fD49a74DD93a88';
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

// Posisi ethCollateralUsdcDebt: jaminan 5,700007 ETH ($13.148,60), utang $1.999,60. Batas LTV tercapai di sisa jaminan
// $2.483,98 (≈ 4,6232 ETH ditarik); HF 1 baru di sisa $2.409,16 (≈ 4,6556 ETH ditarik).
describe('simulate(): withdraw & toggle jaminan', () => {
  describe('positive', () => {
    it('shows HF, remaining borrow limit and liquidation price after withdrawing collateral', () => {
      const sim = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'withdraw', asset: WETH, amount: eth(1) });

      // Sisa jaminan $10.841,83 × 0,83 ÷ $1.999,60.
      expect(sim.account.healthFactor).toBeCloseTo(4.500259, 5);
      expect(sim.account.availableBorrowsUsd).toBeCloseTo(6_728.0758, 2);
      expect(sim.liquidation).toMatchObject({ kind: 'price', dir: 'turun', price: expect.closeTo(512.586, 2) });
      expect(sim).toMatchObject({ overLtv: false, ltvZero: false, gate: 'none' });
    });

    it('turning collateral off without debt changes nothing risky', () => {
      const sim = simulate(read('noDebt'), WHITELIST, { action: 'collateral', asset: USDC, enable: false });

      expect(sim.account.totalCollateralUsd).toBe(0);
      expect(sim.account.healthFactor).toBeNull();
      expect(sim.gate).toBe('none');
    });

    it('turning ETH back on as collateral restores the real HF of the position', () => {
      const off = withUserReserve(read('ethCollateralUsdcDebt'), WETH, { usageAsCollateralEnabledOnUser: false });

      const sim = simulate(off, WHITELIST, { action: 'collateral', asset: WETH, enable: true });
      expect(sim.account.healthFactor).toBeCloseTo(5.457759, 6);
      expect(sim.gate).toBe('none');
    });
  });

  describe('negative', () => {
    it('asks for "confirm" just inside the LTV limit and locks just past it', () => {
      const inside = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'withdraw', asset: WETH, amount: eth(4.62) });
      const past = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'withdraw', asset: WETH, amount: eth(4.64) });

      expect(inside.account.healthFactor).toBeCloseTo(1.034107, 4);
      expect(inside.gate).toBe('type');
      expect(past.gate).toBe('locked');
    });

    // V8: kontrak cuma mensyaratkan HF ≥ 1 untuk withdraw dan mematikan jaminan. App sengaja lebih ketat: dikunci begitu
    // utang melewati batas LTV, supaya user nggak bisa sekali klik langsung ke posisi yang nyaris dilikuidasi.
    it('locks a withdraw the contract would still accept (HF 1,015 ≥ 1 but past the LTV limit), on purpose', () => {
      const sim = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'withdraw', asset: WETH, amount: eth(4.64) });

      expect(sim.account.healthFactor).toBeCloseTo(1.014957, 4);
      expect(sim.account.healthFactor!).toBeGreaterThan(1);
      expect(sim.overLtv).toBe(true);
      expect(sim.gate).toBe('locked');
    });

    it('locks turning off the only collateral while there is debt', () => {
      const sim = simulate(read('ethCollateralUsdcDebt'), WHITELIST, { action: 'collateral', asset: WETH, enable: false });

      expect(sim.overLtv).toBe(true);
      expect(sim.gate).toBe('locked');
    });

    // Aturan ltv0 kontrak (validateHFAndLtvzero): selama masih ada jaminan ber-LTV 0, yang boleh ditarik/dimatikan
    // cuma aset ber-LTV 0 itu sendiri. Di sini tBTC (aset luar) dibuat ber-LTV 0, seperti USDC.e di Arbitrum.
    it('blocks withdrawing or turning off other collateral while an LTV-0 collateral remains', () => {
      const ltvZero = withReserve(read('bahayaWithOutsideAssets'), TBTC, { baseLTVasCollateral: 0n });

      expect(simulate(ltvZero, WHITELIST, { action: 'withdraw', asset: WETH, amount: eth(0.01) }).ltvZero).toBe(true);
      expect(simulate(ltvZero, WHITELIST, { action: 'collateral', asset: WETH, enable: false }).ltvZero).toBe(true);
      // Tanpa jaminan ber-LTV 0, aturan ini nggak berlaku.
      expect(simulate(read('bahayaWithOutsideAssets'), WHITELIST, { action: 'withdraw', asset: WETH, amount: eth(0.01) }).ltvZero).toBe(false);
    });
  });

  describe('edge case', () => {
    it('does not ask for confirmation when withdrawing a supply that is not collateral', () => {
      const notCollateral = withUserReserve(read('waspada'), WETH, { usageAsCollateralEnabledOnUser: false });
      const plus = withUserReserve(notCollateral, USDC, { scaledATokenBalance: 1_000_000_000n, usageAsCollateralEnabledOnUser: true });

      const sim = simulate(plus, WHITELIST, { action: 'withdraw', asset: WETH, amount: eth(1) });
      expect(sim.gate).toBe('none');
    });

    it('treats withdrawing more than the supply as withdrawing all of it', () => {
      const sim = simulate(read('noDebt'), WHITELIST, { action: 'withdraw', asset: USDC, amount: usdc(10_000_000) });

      expect(sim.account.totalCollateralUsd).toBe(0);
      expect(sim.gate).toBe('none');
    });
  });
});

describe('withdrawPlan()', () => {
  const supplied = usdc(1_000);
  // Bantalan = bunga supply 1 hari: APR 3,7743% → 1.000 × 0,037743 ÷ 365 ≈ 0,103406 USDC; 1 jam ≈ 0,004309 USDC.
  const rate = 37_743_000_000_000_000_000_000_000n;
  const max = 2n ** 256n - 1n;

  it('withdraws everything with type(uint256).max when the amount covers the supply (up to a day of interest)', () => {
    const all = { all: true, send: max, spend: supplied + 103_406n, required: supplied + 4_309n };
    expect(withdrawPlan({ supplied, amount: supplied, liquidityRate: rate })).toEqual(all);
    expect(withdrawPlan({ supplied, amount: supplied - 100_000n, liquidityRate: rate })).toEqual(all);
  });

  it('does not turn a typo far above the supply into "withdraw everything"', () => {
    const typo = supplied * 10n;
    expect(withdrawPlan({ supplied, amount: typo, liquidityRate: rate })).toEqual({ all: false, send: typo, spend: typo, required: typo });
  });

  it('withdraws exactly the typed amount otherwise', () => {
    const amount = supplied - 200_000n;
    expect(withdrawPlan({ supplied, amount, liquidityRate: rate })).toEqual({ all: false, send: amount, spend: amount, required: amount });
  });

  it('still cushions the aWETH allowance by at least 1 wei when the supply rate is 0', () => {
    expect(withdrawPlan({ supplied, amount: supplied, liquidityRate: 0n })).toMatchObject({ spend: supplied + 1n, required: supplied + 1n });
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
    // Yang di-approve: utang + bunga 1 hari. Yang cukup untuk lanjut: utang + bunga 1 jam (0,005114 USDC), supaya bunga
    // beberapa detik antara approve dan baca ulang nggak memicu approve kedua.
    expect(repayPlan({ debt, balance: usdc(1_000.2), amount: debt, variableBorrowRate: rate })).toEqual({
      full: true,
      send: 2n ** 256n - 1n,
      spend: 1_000_122_726n,
      required: 1_000_005_114n,
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
      required: debt,
    });
    expect(repayPlan({ debt, balance: usdc(5_000), amount: usdc(400), variableBorrowRate: rate })).toEqual({
      full: false,
      send: usdc(400),
      spend: usdc(400),
      required: usdc(400),
    });
  });
});
