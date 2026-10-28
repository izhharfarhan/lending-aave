import { parseAbi, parseEther } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { accountFromReserves, simulate } from '@/core/simulate';
import { aaveErrorName } from '@/core/walletError';
import { publicClient, TEST_ACCOUNT } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { advanceDays, sendWithMargin, supplyWethCollateral, units, USDC, WETH } from '../../test/fork/position';
import { poolAbi } from './abis';

// E-Mode dibaca dari getter Pool v3.7 (tiket 14). Kategori 1 Ethereum di blok pin = "ETH correlated": jaminan WETH,
// wstETH, cbETH, rETH, weETH, osETH, ETHx (ETHx di ltvzeroBitmap), pinjaman cuma WETH. App ini read-only untuk E-Mode;
// test mengaktifkannya langsung lewat Pool.
const ETH_CORRELATED = 1;
const eModeAbi = parseAbi(['function setUserEMode(uint8 categoryId)']);

// Posisi campuran: 2 ETH (di collateralBitmap, LT/LTV kategori) + 1.000 USDC (di luar bitmap, LT/LTV reserve), E-Mode
// ETH correlated, utang 1 WETH.
async function eModePosition() {
  await supplyWethCollateral('2');
  await fundErc20(USDC, TEST_ACCOUNT, units(1_000));
  await runLikeTheApp('supply', USDC, units(1_000));
  await sendWithMargin({ address: contracts.pool, abi: eModeAbi, functionName: 'setUserEMode', args: [ETH_CORRELATED] });
  await sendWithMargin({ address: contracts.pool, abi: poolAbi, functionName: 'borrow', args: [WETH, parseEther('1'), 2n, 0, TEST_ACCOUNT] });
}

describe('E-Mode read-only (fork Ethereum)', () => {
  describe('positive', () => {
    it('reads the category from the Pool getters', async () => {
      await eModePosition();
      const { eMode } = (await read()).user!;

      expect(eMode).toMatchObject({ id: ETH_CORRELATED, label: 'ETH correlated', ltv: 9300n, liquidationThreshold: 9500n, isolated: false });
      expect(buildChainView(await read(), whitelist).eMode).toMatchObject({ collateral: expect.arrayContaining(['ETH', 'wstETH']), borrowable: ['ETH'] });
    });

    // Paritas (seam 3) dengan E-Mode aktif: tanpa toleransi, juga sesudah bunga 30 hari.
    it('matches getUserAccountData exactly for an E-Mode position, also after 30 days of interest', async () => {
      await eModePosition();
      const now = await read();
      expect(accountFromReserves(now)).toEqual(now.user!.account);

      await advanceDays(30);
      const later = await read();
      expect(accountFromReserves(later)).toEqual(later.user!.account);
    });

    it('lands a borrow on the HF simulated with the category LT', async () => {
      await eModePosition();
      const sim = simulate(await read(), whitelist, { action: 'borrow', asset: WETH, amount: parseEther('0.2') });

      await sendWithMargin({ address: contracts.pool, abi: poolAbi, functionName: 'borrow', args: [WETH, parseEther('0.2'), 2n, 0, TEST_ACCOUNT] });
      expect(Number((await read()).user!.account.healthFactor) / 1e18).toBeCloseTo(sim.account.healthFactor!, 6);
    });
  });

  describe('negative', () => {
    it('leaves USDC out of Pasar pinjam, matching the Pool rejecting it in E-Mode', async () => {
      await eModePosition();
      expect(buildChainView(await read(), whitelist).borrowMarket.map((r) => r.symbol)).toEqual(['ETH']);

      const rejected = await publicClient
        .simulateContract({ account: TEST_ACCOUNT, address: contracts.pool, abi: poolAbi, functionName: 'borrow', args: [USDC, units(10), 2n, 0, TEST_ACCOUNT] })
        .catch((error: unknown) => error);
      expect(aaveErrorName(rejected)).toBe('NotBorrowableInEMode');
    });
  });
});
