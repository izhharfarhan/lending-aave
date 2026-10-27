import { readFileSync } from 'node:fs';
import type { Address } from 'viem';

import { buildChainView, riskLevel, visibleSupplyMarket, type ChainRead, type WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';

// Fixture asli: hasil `readChain` di Ethereum mainnet blok pin 26.282.000, posisi akun mainnet nyata
// (`pnpm fixture:position`). Angka harapan di bawah dibaca dari getUserAccountData / dihitung tangan, bukan dari modul.
type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
// Jest jalan dari root repo.
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chain } = fixture;
const read = (label: string): ChainRead => ({ ...chain, user: users[label] });
const guest: ChainRead = { ...chain, user: null };
// Di blok pin nggak ada reserve whitelist yang frozen/paused/nonaktif, jadi kasus itu dibuat dari fixture asli dengan
// flag satu reserve diganti.
const withReserve = (base: ChainRead, asset: Address, flags: Partial<ChainRead['reserves'][number]>): ChainRead => ({
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

describe('buildChainView()', () => {
  describe('positive', () => {
    it('takes HF, totals and remaining borrow limit from getUserAccountData', () => {
      const { account } = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);

      expect(account).not.toBeNull();
      expect(account!.healthFactor).toBeCloseTo(5.457759, 6);
      expect(account!.risk).toBe('aman');
      expect(account!.totalCollateralUsd).toBeCloseTo(13_148.60476537, 8);
      expect(account!.totalDebtUsd).toBeCloseTo(1_999.60115935, 8);
      expect(account!.availableBorrowsUsd).toBeCloseTo(8_585.02567677, 8);
      // utang ÷ (jaminan × LTV 80,5%) = 1.999,60 ÷ 10.584,63
      expect(account!.borrowLimitUsed).toBeCloseTo(0.18892, 5);
    });

    it('labels a real HF 1,88 position Waspada and a real HF 1,30 position Bahaya', () => {
      expect(buildChainView(read('waspada'), WHITELIST).account).toMatchObject({ risk: 'waspada' });
      expect(buildChainView(read('waspada'), WHITELIST).account!.healthFactor).toBeCloseTo(1.877068, 6);
      expect(buildChainView(read('bahayaWithOutsideAssets'), WHITELIST).account).toMatchObject({ risk: 'bahaya' });
    });
  });

  describe('positive: Supply Anda & Utang Anda', () => {
    it('lists whitelisted supply and debt with accrued amounts that add up to the contract totals', () => {
      const view = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);

      expect(view.supplies).toEqual([
        expect.objectContaining({ asset: WETH, symbol: 'ETH', collateral: true, outside: false, status: 'aktif' }),
      ]);
      expect(view.borrows).toEqual([expect.objectContaining({ asset: USDC, symbol: 'USDC', outside: false, status: 'aktif' })]);
      // Satu-satunya jaminan/utang, jadi nilainya harus sama dengan total getUserAccountData.
      expect(view.supplies[0].amountUsd).toBeCloseTo(13_148.60476537, 2);
      expect(view.borrows[0].amountUsd).toBeCloseTo(1_999.60115935, 2);
      // Utang kontrak $1.999,60115935 ÷ harga oracle USDC $0,99979651 = 2.000,008141 USDC.
      expect(view.borrows[0].amount).toBe(2_000_008_141n);
    });

    it('converts the on-chain APR (ray) into APY', () => {
      const view = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);

      // WETH liquidityRate 1,2967% APR → e^0,012967 − 1 ≈ 1,3052% APY.
      expect(view.supplies[0].apy).toBeCloseTo(0.013052, 6);
    });

    it('shows outside assets read-only after whitelisted ones, still counted in the totals', () => {
      const view = buildChainView(read('bahayaWithOutsideAssets'), WHITELIST);
      const sumUsd = (rows: { amountUsd: number }[]) => rows.reduce((total, row) => total + row.amountUsd, 0);

      expect(view.supplies.map((r) => [r.symbol, r.outside])).toEqual([
        ['ETH', false],
        ['tBTC', true],
      ]);
      expect(view.borrows.map((r) => [r.symbol, r.outside])).toEqual([
        ['USDC', false],
        ['GHO', true],
      ]);
      expect(sumUsd(view.supplies)).toBeCloseTo(34_216.41416277, 1);
      expect(sumUsd(view.borrows)).toBeCloseTo(20_646.07758036, 1);
    });

    it('keeps a supply that is not collateral, marked as such', () => {
      const view = buildChainView(read('ethDebtOutsideNonCollateral'), WHITELIST);
      const collateralUsd = view.supplies.filter((r) => r.collateral).reduce((total, row) => total + row.amountUsd, 0);

      expect(view.supplies.map((r) => [r.symbol, r.collateral, r.outside])).toEqual([
        ['ETH', true, false],
        ['USDT', true, false],
        ['LINK', false, true],
      ]);
      expect(view.borrows.map((r) => r.symbol)).toEqual(['ETH']);
      expect(collateralUsd).toBeCloseTo(11_550.48484004, 1);
    });
  });

  describe('positive: Dibekukan & Dijeda', () => {
    it('keeps a position in a frozen reserve, labelled Dibekukan, still in the totals', () => {
      const frozen = withReserve(read('ethCollateralUsdcDebt'), WETH, { isFrozen: true });
      const view = buildChainView(frozen, WHITELIST);

      expect(view.supplies).toEqual([expect.objectContaining({ symbol: 'ETH', status: 'dibekukan' })]);
      expect(view.supplies[0].amountUsd).toBeCloseTo(13_148.60476537, 2);
    });

    it('labels a paused reserve Dijeda, even when it is also frozen', () => {
      const paused = withReserve(read('ethCollateralUsdcDebt'), USDC, { isPaused: true, isFrozen: true });

      expect(buildChainView(paused, WHITELIST).borrows).toEqual([expect.objectContaining({ symbol: 'USDC', status: 'dijeda' })]);
    });
  });

  describe('positive: Pasar supply & Pasar pinjam', () => {
    it('offers every whitelisted asset to supply, with wallet balance (native ETH for the WETH reserve) and APY', () => {
      const { supplyMarket } = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);

      expect(supplyMarket).toEqual([
        expect.objectContaining({ asset: WETH, symbol: 'ETH', walletBalance: 294_742_680_568_188_361n, canBeCollateral: true }),
        expect.objectContaining({ asset: USDC, symbol: 'USDC', walletBalance: 1_000_000n, canBeCollateral: true }),
        expect.objectContaining({ asset: USDT, symbol: 'USDT', walletBalance: 0n, canBeCollateral: true }),
      ]);
      expect(supplyMarket[0].apy).toBeCloseTo(0.013052, 6);
    });

    it('carries the oracle price and the allowance to the Pool that the action panel needs', () => {
      const { supplyMarket } = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);
      const usdc = supplyMarket.find((r) => r.symbol === 'USDC')!;

      // Harga oracle USDC di blok pin: 99.979.651 / 1e8.
      expect(usdc.priceUsd).toBeCloseTo(0.99979651, 8);
      expect(usdc.allowance).toBe(0n);
      // ETH lewat gateway: nggak ada approve ke Pool.
      expect(supplyMarket.find((r) => r.symbol === 'ETH')!.allowance).toBeNull();
      expect(buildChainView(guest, WHITELIST).supplyMarket.map((r) => r.allowance)).toEqual([null, null, null]);
    });

    it('tells the panel which assets go through the gateway and which need an allowance reset first', () => {
      const { supplyMarket } = buildChainView(guest, WHITELIST);

      expect(supplyMarket.map((r) => [r.symbol, r.native, r.requiresApprovalReset])).toEqual([
        ['ETH', true, false],
        ['USDC', false, false],
        ['USDT', false, true],
      ]);
    });

    it('hides zero wallet balances unless "Tampilkan semua" is on', () => {
      const { supplyMarket } = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);

      expect(visibleSupplyMarket(supplyMarket, false).map((r) => r.symbol)).toEqual(['ETH', 'USDC']);
      expect(visibleSupplyMarket(supplyMarket, true).map((r) => r.symbol)).toEqual(['ETH', 'USDC', 'USDT']);
    });

    it('offers borrowable whitelisted assets with how much the remaining borrow limit buys of each', () => {
      const { borrowMarket } = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);

      // Sisa batas pinjam $8.585,02567677 ÷ harga oracle tiap aset.
      expect(borrowMarket).toEqual([
        expect.objectContaining({ symbol: 'ETH', borrowable: 3_721_665_218_799_446_845n }),
        expect.objectContaining({ symbol: 'USDC', borrowable: 8_586_772_999n }),
        expect.objectContaining({ symbol: 'USDT', borrowable: 8_598_955_985n }),
      ]);
      // USDC variableBorrowRate 4,4795% APR → ≈ 4,5813% APY.
      expect(borrowMarket[1].apy).toBeCloseTo(0.045813, 5);
    });

    it('carries what the Borrow and Repay tabs need: oracle price, wallet balance, allowance and borrow rate', () => {
      const view = buildChainView(read('bahayaWithOutsideAssets'), WHITELIST);
      const usdcDebt = view.borrows.find((r) => r.symbol === 'USDC')!;

      expect(view.borrowMarket.map((r) => [r.symbol, r.native, r.priceUsd])).toEqual([
        ['ETH', true, 2_306.77],
        ['USDC', false, 0.99979651],
        ['USDT', false, 0.99838],
      ]);
      // Wallet 200 USDC, belum ada izin ke Pool; APR pinjaman USDC (ray) untuk bantalan bunga repay penuh.
      expect(usdcDebt).toMatchObject({
        walletBalance: 200_000_000n,
        allowance: 0n,
        priceUsd: 0.99979651,
        borrowRate: 44_794_710_292_724_102_718_356_564n,
        native: false,
        requiresApprovalReset: false,
      });
      // Aset luar (GHO) nggak punya aksi: saldo wallet & izinnya nggak dibaca.
      expect(view.borrows.find((r) => r.symbol === 'GHO')).toMatchObject({ walletBalance: null, allowance: null });
    });

    it('carries what the Withdraw tab and collateral toggle need on each supply row', () => {
      const view = buildChainView(read('bahayaWithOutsideAssets'), WHITELIST);

      expect(view.supplies.find((r) => r.symbol === 'ETH')).toMatchObject({
        native: true,
        canBeCollateral: true,
        priceUsd: 2_306.77,
        supplyRate: 12_967_341_922_595_086_691_268_399n,
      });
      // Aset luar nggak punya aksi, tapi tetap ditandai bisa/tidaknya jadi jaminan dari LTV reserve-nya.
      expect(view.supplies.find((r) => r.symbol === 'tBTC')).toMatchObject({ native: false, canBeCollateral: true });
    });

    it('shows assets and APY read-only before connecting, without hiding anything', () => {
      const { supplyMarket, borrowMarket } = buildChainView(guest, WHITELIST);

      expect(visibleSupplyMarket(supplyMarket, false).map((r) => [r.symbol, r.walletBalance])).toEqual([
        ['ETH', null],
        ['USDC', null],
        ['USDT', null],
      ]);
      expect(borrowMarket.map((r) => [r.symbol, r.borrowable])).toEqual([
        ['ETH', null],
        ['USDC', null],
        ['USDT', null],
      ]);
    });
  });

  describe('negative: reserve yang tidak ditawarkan', () => {
    it.each([
      ['frozen', { isFrozen: true }],
      ['paused', { isPaused: true }],
      ['inactive', { isActive: false }],
    ])('leaves a %s reserve out of both markets', (_label, flags) => {
      const view = buildChainView(withReserve(read('ethCollateralUsdcDebt'), USDT, flags), WHITELIST);

      expect(view.supplyMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC']);
      expect(view.borrowMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC']);
    });

    it('keeps a reserve with borrowing disabled in the supply market only', () => {
      const view = buildChainView(withReserve(guest, USDT, { borrowingEnabled: false }), WHITELIST);

      expect(view.supplyMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC', 'USDT']);
      expect(view.borrowMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC']);
    });

    it('never offers outside assets, even ones the user holds', () => {
      const view = buildChainView(read('bahayaWithOutsideAssets'), WHITELIST);

      expect(view.supplyMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC', 'USDT']);
      expect(view.borrowMarket.map((r) => r.symbol)).toEqual(['ETH', 'USDC', 'USDT']);
    });
  });

  describe('negative', () => {
    it('has no positions for an address that has none, nor before connecting', () => {
      expect(buildChainView(read('empty'), WHITELIST)).toMatchObject({ supplies: [], borrows: [] });
      expect(buildChainView(guest, WHITELIST)).toMatchObject({ supplies: [], borrows: [] });
    });

    it('has no account summary before the wallet is connected', () => {
      expect(buildChainView(guest, WHITELIST).account).toBeNull();
    });
  });

  describe('edge case', () => {
    it('reports "no debt" instead of the contract\'s uint256.max HF, and hides the borrow-limit bar', () => {
      const { account } = buildChainView(read('noDebt'), WHITELIST);

      expect(account).toMatchObject({ healthFactor: null, risk: null, totalDebtUsd: 0, borrowLimitUsed: null });
      expect(account!.totalCollateralUsd).toBeCloseTo(266_443.37919858, 8);
    });

    it('puts HF exactly on a threshold into the safer level', () => {
      expect(riskLevel(2)).toBe('aman');
      expect(riskLevel(1.999)).toBe('waspada');
      expect(riskLevel(1.5)).toBe('waspada');
      expect(riskLevel(1.499)).toBe('bahaya');
      expect(riskLevel(0.95)).toBe('bahaya');
    });

    it('marks an asset with LTV 0 as not usable as collateral', () => {
      const view = buildChainView(withReserve(guest, USDT, { baseLTVasCollateral: 0n }), WHITELIST);

      expect(view.supplyMarket.map((r) => [r.symbol, r.canBeCollateral])).toEqual([
        ['ETH', true],
        ['USDC', true],
        ['USDT', false],
      ]);
    });

    it('reports the borrow limit as overrun when debt remains but collateral counts for LTV 0', () => {
      const read0 = read('ethCollateralUsdcDebt');
      const ltvZero: ChainRead = { ...read0, user: { ...read0.user!, account: { ...read0.user!.account, ltv: 0n, availableBorrowsBase: 0n } } };

      expect(buildChainView(ltvZero, WHITELIST).account!.borrowLimitUsed).toBe(Infinity);
    });

    it('can borrow nothing more once the borrow limit is used up', () => {
      const read0 = read('ethCollateralUsdcDebt');
      const full: ChainRead = { ...read0, user: { ...read0.user!, account: { ...read0.user!.account, availableBorrowsBase: 0n } } };

      expect(buildChainView(full, WHITELIST).borrowMarket.map((r) => r.borrowable)).toEqual([0n, 0n, 0n]);
    });
  });
});
