import { erc20Abi, parseAbi } from 'viem';

import { TEST_ACCOUNTS } from '@/config/fork';
import { buildChainView } from '@/core/chainPosition';
import { accountFromReserves, liquidationPrice } from '@/core/simulate';
import { aaveErrorName } from '@/core/walletError';
import { publicClient, testClient } from '../../test/fork/clients';
import { contracts, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { supplyWethCollateral, units, USDC, USDT, WETH } from '../../test/fork/position';
import { liquidate, mockAggregatorOf, resetOraclePrice, setOraclePrice } from './forkActions';

// Tiket 18: harga ETH di oracle Aave fork diganti lewat mock aggregator (V7), lalu posisi user tes dilikuidasi dari akun
// likuidator. Posisi: 10 ETH jaminan (LT 83%), utang 15.000 USDC → HF ≈ 1,28 di harga pin $2.306,77. Sengaja besar: di
// v3.7 sisa utang/jaminan di bawah $1.000 sesudah likuidasi 50% (`MIN_LEFTOVER_BASE`) membuat close factor jadi 100%.
const clients = { publicClient, testClient };
const oracle = { oracle: contracts.oracle, admin: contracts.aclAdmin };
const oracleAbi = parseAbi(['function getAssetPrice(address) view returns (uint256)', 'function getSourceOfAsset(address) view returns (address)']);
const priceOf = (asset: typeof WETH) => publicClient.readContract({ address: contracts.oracle, abi: oracleAbi, functionName: 'getAssetPrice', args: [asset] });
const sourceOf = (asset: typeof WETH) => publicClient.readContract({ address: contracts.oracle, abi: oracleAbi, functionName: 'getSourceOfAsset', args: [asset] });
const usd8 = (n: number) => BigInt(Math.round(n * 1e8));
const hfOf = (value: bigint) => Number(value) / 1e18;

async function ethCollateralUsdcDebt() {
  await supplyWethCollateral('10');
  await runLikeTheApp('borrow', USDC, units(15_000), { riskChecked: true, riskTyped: true });
}
const debtOf = async (asset: typeof USDC) => buildChainView(await read(), whitelist).borrows.find((r) => r.asset === asset)?.amount ?? 0n;
const usdcDebt = () => debtOf(USDC);
const liquidateEthFor = async (debt: typeof USDC) =>
  liquidate(clients, { pool: contracts.pool, liquidator: TEST_ACCOUNTS.liquidator, user: TEST_ACCOUNTS.user, collateral: WETH, debt, debtAmount: await debtOf(debt) });
const liquidateEthForUsdc = () => liquidateEthFor(USDC);

describe('Dev Tools oracle & likuidasi (fork Ethereum)', () => {
  describe('positive', () => {
    it('reprices ETH through the mock; HF follows exactly and the liquidation price stays put', async () => {
      await ethCollateralUsdcDebt();
      const before = await read();

      await setOraclePrice(clients, { ...oracle, asset: WETH, price: usd8(2_000) });

      const after = await read();
      expect(await priceOf(WETH)).toBe(usd8(2_000));
      expect(accountFromReserves(after)).toEqual(after.user!.account);
      // Cuma jaminan ETH yang berubah nilainya, jadi HF ikut turun sebanding harga.
      expect(hfOf(after.user!.account.healthFactor) / hfOf(before.user!.account.healthFactor)).toBeCloseTo(2_000 / 2_306.77, 3);
      const [liqBefore, liqAfter] = [liquidationPrice(before, whitelist), liquidationPrice(after, whitelist)];
      expect(liqBefore.kind === 'price' && liqAfter.kind === 'price').toBe(true);
      if (liqBefore.kind !== 'price' || liqAfter.kind !== 'price') return;
      expect(liqAfter.price).toBeCloseTo(liqBefore.price, 2);
      expect(liqAfter.pct).toBeCloseTo(liqAfter.price / 2_000 - 1, 4);
    });

    it('rewrites only the mock on later changes, and resets to the original source', async () => {
      const original = await sourceOf(WETH);
      const pinned = await priceOf(WETH);

      await setOraclePrice(clients, { ...oracle, asset: WETH, price: usd8(2_000) });
      await setOraclePrice(clients, { ...oracle, asset: WETH, price: usd8(1_800) });
      expect(await sourceOf(WETH)).toBe(mockAggregatorOf(WETH));
      expect(await priceOf(WETH)).toBe(usd8(1_800));

      await resetOraclePrice(clients, { ...oracle, asset: WETH });
      expect(await sourceOf(WETH)).toBe(original);
      expect(await priceOf(WETH)).toBe(pinned);
    });

    // $1.800 → HF ≈ 0,996: di bawah 1 tapi di atas 0,95, jadi close factor 50% dan posisinya tersisa ±separuh.
    it('liquidates the test position from the liquidator account once HF < 1', async () => {
      await ethCollateralUsdcDebt();
      await setOraclePrice(clients, { ...oracle, asset: WETH, price: usd8(1_800) });
      const before = await read();
      expect(hfOf(before.user!.account.healthFactor)).toBeLessThan(1);
      const debtBefore = await usdcDebt();

      await liquidateEthForUsdc();

      const after = await read();
      expect(after.user!.account.totalDebtBase).toBeLessThan(before.user!.account.totalDebtBase);
      expect(after.user!.account.totalCollateralBase).toBeLessThan(before.user!.account.totalCollateralBase);
      expect(await usdcDebt()).toBeLessThan(debtBefore);
      expect(await usdcDebt()).toBeGreaterThan(debtBefore / 3n);
      // Likuidator menerima jaminan sebagai WETH (receiveAToken = false).
      const liquidatorWeth = await publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: 'balanceOf', args: [TEST_ACCOUNTS.liquidator] });
      expect(liquidatorWeth).toBeGreaterThan(0n);
    });
  });

  describe('edge cases', () => {
    // USDT Ethereum: `approve` tanpa nilai kembali, dan menolak approve dari izin ≠ 0 ke nilai ≠ 0.
    it('liquidates a USDT debt too, twice in a row from the same liquidator', async () => {
      await supplyWethCollateral('10');
      await runLikeTheApp('borrow', USDT, units(15_000), { riskChecked: true, riskTyped: true });
      await setOraclePrice(clients, { ...oracle, asset: WETH, price: usd8(1_800) });
      const debtBefore = await debtOf(USDT);

      await liquidateEthFor(USDT);
      expect(await debtOf(USDT)).toBeLessThan(debtBefore);

      await setOraclePrice(clients, { ...oracle, asset: WETH, price: usd8(1_500) });
      const debtMiddle = await debtOf(USDT);
      await liquidateEthFor(USDT);
      expect(await debtOf(USDT)).toBeLessThan(debtMiddle);
    });
  });

  describe('negative', () => {
    it('refuses to liquidate while HF ≥ 1, with the Pool error', async () => {
      await ethCollateralUsdcDebt();

      const error = await liquidateEthForUsdc().catch((e: unknown) => e);
      expect(aaveErrorName(error)).toBe('HealthFactorNotBelowThreshold');
    });
  });
});
