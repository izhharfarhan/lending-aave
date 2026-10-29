import { erc20Abi, maxUint256, type Address } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { aaveErrorName } from '@/core/walletError';
import { publicClient, TEST_ACCOUNT, walletClient } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { USDC, USDT, units } from '../../test/fork/position';
import { poolRequest } from './poolTx';

const supplyLikeTheApp = (asset: Address, amount: bigint, approvalMode: 'exact' | 'unlimited' = 'exact') =>
  runLikeTheApp('supply', asset, amount, { approvalMode });

const allowanceToPool = (asset: Address) =>
  publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'allowance', args: [TEST_ACCOUNT, contracts.pool] });

describe('supply ERC20 (fork Ethereum)', () => {
  describe('positive', () => {
    it('supplies 1.000 USDC with an exact approve, leaving no allowance and turning it into collateral', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(5_000));

      const sent = await supplyLikeTheApp(USDC, units(1_000));
      const after = await read();
      const view = buildChainView(after, whitelist);

      expect(sent).toEqual([{ step: 'approve', approveAmount: units(1_000) }, { step: 'supply' }]);
      expect(after.user!.walletBalances[USDC]).toBe(units(4_000));
      expect(await allowanceToPool(USDC)).toBe(0n);
      // aToken dibulatkan ke bawah oleh kontrak: boleh kurang 1 unit terkecil, nggak boleh lebih.
      const row = view.supplies.find((r) => r.asset === USDC)!;
      expect(units(1_000) - row.amount).toBeGreaterThanOrEqual(0n);
      expect(units(1_000) - row.amount).toBeLessThanOrEqual(1n);
      // Supply pertama aset yang boleh jadi jaminan otomatis aktif sebagai jaminan.
      expect(row.collateral).toBe(true);
      expect(view.account!.totalCollateralUsd).toBeGreaterThan(990);
    });

    // Supply kedua juga yang dulu kehabisan gas tanpa margin (lihat core/gasMargin.ts).
    it('skips the approve on the next supply after the user chose unlimited', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(5_000));

      expect(await supplyLikeTheApp(USDC, units(1_000), 'unlimited')).toEqual([
        { step: 'approve', approveAmount: maxUint256 },
        { step: 'supply' },
      ]);
      expect(await supplyLikeTheApp(USDC, units(500), 'unlimited')).toEqual([{ step: 'supply' }]);
    });
  });

  describe('edge case', () => {
    it('resets a leftover USDT allowance to 0 before approving the exact amount', async () => {
      await fundErc20(USDT, TEST_ACCOUNT, units(5_000));
      // Sisa izin dari supply lama yang gagal/batal.
      const hash = await walletClient.writeContract({ address: USDT, abi: erc20Abi, functionName: 'approve', args: [contracts.pool, units(30)] });
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await supplyLikeTheApp(USDT, units(1_000))).toEqual([
        { step: 'resetApproval' },
        { step: 'approve', approveAmount: units(1_000) },
        { step: 'supply' },
      ]);
      expect(await allowanceToPool(USDT)).toBe(0n);
    });
  });

  describe('negative', () => {
    it('decodes an Aave revert into its custom error name for translation', async () => {
      const request = poolRequest({ step: 'supply' }, { pool: contracts.pool, asset: USDC, amount: 0n, user: TEST_ACCOUNT });
      const error = await publicClient.simulateContract({ ...request, account: TEST_ACCOUNT }).catch((e: unknown) => e);

      expect(aaveErrorName(error)).toBe('InvalidAmount');
    });
  });
});
