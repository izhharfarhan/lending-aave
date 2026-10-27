import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import { parseEther, type Address } from 'viem';

import { minGasReserve } from '@/config/chains';
import { MAX_CAPACITY_HORIZON_SECONDS } from '@/core/capacity';
import { buildChainView } from '@/core/chainPosition';
import { capacityOf, panelMax, type PanelTab } from '@/core/panel';
import { aaveErrorName } from '@/core/walletError';
import { publicClient, TEST_ACCOUNT, testClient, walletClient } from '../../test/fork/clients';
import { asPoolAdmin } from '../../test/fork/admin';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, panelState, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { supplyWethCollateral, units, USDC, WETH } from '../../test/fork/position';
import { poolAbi } from './abis';

const confirmed = { riskChecked: true, riskTyped: true };
const ethBalance = () => publicClient.getBalance({ address: TEST_ACCOUNT });

// MAX yang dihitung app untuk data fork saat ini, persis seperti tombol MAX (biaya jaringan belum diketahui).
async function maxNow(tab: PanelTab, asset: Address) {
  const chain = await read();
  return panelMax(chain, buildChainView(chain, whitelist), whitelist, { tab, asset, minGasReserve: minGasReserve(1), networkFee: null })!;
}

// Cap diturunkan lewat PoolConfigurator, sebagai pool admin (executor governance Aave) yang di-impersonate.
const setCap = (functionName: 'setSupplyCap' | 'setBorrowCap', asset: Address, tokens: bigint) =>
  asPoolAdmin({ publicClient, testClient, walletClient }, AaveV3Ethereum, { functionName, args: [asset, tokens] });

// Cap baru = yang sudah terpakai (versi app, 10 menit ke depan) + `room` USDC, dibulatkan ke atas ke token utuh.
async function capWithRoom(kind: 'supplyCap' | 'borrowCap', room: bigint) {
  const chain = await read();
  const huge = 10n ** 15n;
  const uncapped = { ...chain, reserves: chain.reserves.map((r) => (r.underlyingAsset === USDC ? { ...r, supplyCap: huge, borrowCap: huge } : r)) };
  const used = huge * 10n ** 6n - capacityOf(uncapped, USDC, MAX_CAPACITY_HORIZON_SECONDS)[kind]!;
  return (used + 10n ** 6n - 1n) / 10n ** 6n + room;
}

const simulatePool = (functionName: 'supply' | 'borrow', amount: bigint) =>
  publicClient
    .simulateContract({
      account: TEST_ACCOUNT,
      address: contracts.pool,
      abi: poolAbi,
      functionName,
      args: functionName === 'supply' ? [USDC, amount, TEST_ACCOUNT, 0] : [USDC, amount, 2n, 0, TEST_ACCOUNT],
    } as never)
    .catch((e: unknown) => e);

describe('MAX + kapasitas pool (fork Ethereum)', () => {
  describe('positive', () => {
    it('MAX borrow right below the LTV limit goes through, still behind the risk confirmation', async () => {
      await supplyWethCollateral('1');
      const amount = await maxNow('borrow', USDC);

      expect((await panelState('borrow', USDC, amount)).step).toMatchObject({ step: 'confirmRisk' });
      expect(await runLikeTheApp('borrow', USDC, amount, confirmed)).toEqual([{ step: 'borrow' }]);
    });

    it('MAX withdraw of collateral backing a debt goes through, and a little more is locked', async () => {
      await runLikeTheApp('supply', WETH, parseEther('1'));
      await runLikeTheApp('borrow', USDC, units(1_000), confirmed);
      const amount = await maxNow('withdraw', WETH);

      expect(amount).toBeGreaterThan(0n);
      expect(amount).toBeLessThan(parseEther('1'));
      expect(await runLikeTheApp('withdraw', WETH, amount, confirmed)).toEqual([{ step: 'approve', approveAmount: amount }, { step: 'withdraw' }]);
      // MAX berhenti 0,1% di bawah batas LTV; 0,2% lebih dari itu sudah dikunci.
      expect((await panelState('withdraw', WETH, (amount * 1_002n) / 1_000n + parseEther('0.01'), confirmed)).step).toEqual({ step: 'overLtv' });
    });

    it('MAX supply ETH leaves the gas reserve in the wallet', async () => {
      await testClient.setBalance({ address: TEST_ACCOUNT, value: parseEther('1') });
      const amount = await maxNow('supply', WETH);

      expect(amount).toBe(parseEther('0.9995'));
      expect(await runLikeTheApp('supply', WETH, amount)).toEqual([{ step: 'supply' }]);
      expect(await ethBalance()).toBeGreaterThan(0n);
    });

    it('MAX repay with enough in the wallet pays the whole debt (type(uint256).max), no dust left', async () => {
      await supplyWethCollateral('1');
      await runLikeTheApp('borrow', USDC, units(100), confirmed);
      await fundErc20(USDC, TEST_ACCOUNT, units(200));
      const amount = await maxNow('repay', USDC);

      expect(amount).toBeGreaterThanOrEqual(units(100));
      expect(amount).toBeLessThan(units(100.01));
      await runLikeTheApp('repay', USDC, amount);
      expect(buildChainView(await read(), whitelist).borrows).toEqual([]);
    });
  });

  describe('negative', () => {
    it('MAX supply fills the supply cap exactly where the Pool still accepts it; past it the button and the Pool both refuse', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(2_000));
      await setCap('setSupplyCap', USDC, await capWithRoom('supplyCap', 1_000n));
      const amount = await maxNow('supply', USDC);

      // Sisa ±1.000 USDC; bunga pool USDC ±2,5 USDC per detik ikut memakan kuota selama test berjalan.
      expect(amount).toBeGreaterThan(units(900));
      expect(amount).toBeLessThanOrEqual(units(1_000));
      expect(await runLikeTheApp('supply', USDC, amount)).toEqual([{ step: 'approve', approveAmount: amount }, { step: 'supply' }]);

      // Sisa kuota menurut aturan kontrak saat ini (bantalan 10 menit MAX sudah nggak dihitung); +100 USDC menutup bunga
      // beberapa detik sampai simulasi Pool.
      const over = capacityOf(await read(), USDC).supplyCap! + units(100);
      expect((await panelState('supply', USDC, over)).step).toMatchObject({ step: 'overCapacity', limit: 'supplyCap' });
      expect(aaveErrorName(await simulatePool('supply', over))).toBe('SupplyCapExceeded');
    });

    it('MAX borrow fills the borrow cap; past it the button and the Pool both refuse', async () => {
      await supplyWethCollateral('2');
      await setCap('setBorrowCap', USDC, await capWithRoom('borrowCap', 1_000n));
      const amount = await maxNow('borrow', USDC);

      expect(amount).toBeGreaterThan(units(900));
      expect(amount).toBeLessThanOrEqual(units(1_000));
      expect(await runLikeTheApp('borrow', USDC, amount, confirmed)).toEqual([{ step: 'borrow' }]);

      const over = capacityOf(await read(), USDC).borrowCap! + units(100);
      expect((await panelState('borrow', USDC, over, confirmed)).step).toMatchObject({ step: 'overCapacity', limit: 'borrowCap' });
      expect(aaveErrorName(await simulatePool('borrow', over))).toBe('BorrowCapExceeded');
    });
  });
});
