import type { Address } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { aaveErrorName } from '@/core/walletError';
import { publicClient, TEST_ACCOUNT } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, panelState, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { advanceDays, units, USDC, USDT } from '../../test/fork/position';
import { gasLimitFor } from './gasLimit';
import { poolRequest } from './poolTx';


const usdcSupply = async () => buildChainView(await read(), whitelist).supplies.find((r) => r.asset === USDC);

/** Jaminan USDC lewat app, ditambah utang USDT kalau diminta. */
async function usdcCollateral(supply: number, borrowUsdt = 0) {
  await fundErc20(USDC, TEST_ACCOUNT, units(supply));
  await runLikeTheApp('supply', USDC, units(supply));
  if (borrowUsdt) await runLikeTheApp('borrow', USDT, units(borrowUsdt), { riskChecked: true, riskTyped: true });
}

// Estimasi = cara app (dan wallet) tahu kontrak menerima atau menolak transaksi itu, sebelum dikirim.
const estimate = (step: 'withdraw' | 'setCollateral', amount: bigint, useAsCollateral = false) => {
  const request = poolRequest({ step }, { pool: contracts.pool, asset: USDC, amount, user: TEST_ACCOUNT, useAsCollateral });
  return gasLimitFor(publicClient, request, TEST_ACCOUNT);
};

describe('withdraw ERC20 & toggle jaminan (fork Ethereum)', () => {
  describe('positive', () => {
    it('withdraws part of a USDC collateral back to the wallet and lands on the simulated HF', async () => {
      // Jaminan 2.000 USDC, utang 500 USDT (HF ≈ 3,12). Tarik 800 → HF ≈ 1,87: Waspada, cukup diperingatkan.
      await usdcCollateral(2_000, 500);
      const { sim, step } = await panelState('withdraw', USDC, units(800));
      expect(sim?.gate).toBe('warn');
      expect(step).toEqual({ step: 'withdraw' });

      expect(await runLikeTheApp('withdraw', USDC, units(800))).toEqual([{ step: 'withdraw' }]);
      const after = await read();

      expect(after.user!.walletBalances[USDC]).toBe(units(800));
      expect(Number(after.user!.account.healthFactor) / 1e18).toBeCloseTo(sim!.account.healthFactor!, 5);
    });

    it('withdraws everything with type(uint256).max after interest accrued, leaving no aToken dust', async () => {
      await usdcCollateral(1_000);
      await advanceDays(30);
      const supplied = (await usdcSupply())!.amount;
      expect(supplied).toBeGreaterThan(units(1_000));

      const { withdraw } = await panelState('withdraw', USDC, supplied);
      expect(withdraw?.all).toBe(true);
      await runLikeTheApp('withdraw', USDC, supplied);
      const after = await read();

      expect(after.user!.reserves.find((r) => r.underlyingAsset === USDC)!.scaledATokenBalance).toBe(0n);
      expect(after.user!.walletBalances[USDC]).toBeGreaterThanOrEqual(supplied);
    });

    it('turns collateral off and back on, one transaction each, without an amount', async () => {
      await usdcCollateral(1_000);
      expect((await usdcSupply())!.collateral).toBe(true);

      expect(await runLikeTheApp('collateral', USDC, 0n)).toEqual([{ step: 'setCollateral' }]);
      expect((await usdcSupply())!.collateral).toBe(false);
      expect((await read()).user!.account.totalCollateralBase).toBe(0n);

      await runLikeTheApp('collateral', USDC, 0n);
      expect((await usdcSupply())!.collateral).toBe(true);
    });
  });

  describe('negative', () => {
    // V8: kontrak cuma mensyaratkan HF ≥ 1 untuk withdraw jaminan; app sengaja mengunci begitu melewati batas LTV.
    // Jaminan 2.000 USDC (LTV 75%, LT 78%), utang 1.400 USDT: tarik 140 USDC → sisa batas LTV < utang, tapi HF ≈ 1,04.
    it('locks a withdraw the contract would still accept (past the LTV limit, HF ≥ 1), on purpose', async () => {
      await usdcCollateral(2_000, 1_400);

      const { sim, step } = await panelState('withdraw', USDC, units(140));
      expect(sim?.overLtv).toBe(true);
      expect(sim!.account.healthFactor!).toBeGreaterThan(1);
      expect(step).toEqual({ step: 'overLtv' });
      await expect(estimate('withdraw', units(140))).resolves.toBeGreaterThan(0n);

      // HF < 1 (tarik 220 USDC): app dan kontrak sama-sama menolak.
      expect((await panelState('withdraw', USDC, units(220))).step).toEqual({ step: 'overLtv' });
      const error = await estimate('withdraw', units(220)).catch((e: unknown) => e);
      expect(aaveErrorName(error)).toBe('HealthFactorLowerThanLiquidationThreshold');
    });

    it('locks turning off the only collateral while there is debt, and the Pool refuses it too', async () => {
      await usdcCollateral(2_000, 500);

      expect((await panelState('collateral', USDC, 0n)).step).toEqual({ step: 'overLtv' });
      const error = await estimate('setCollateral', 0n, false).catch((e: unknown) => e);
      expect(aaveErrorName(error)).toBe('HealthFactorLowerThanLiquidationThreshold');
    });
  });
});
