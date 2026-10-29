import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import { erc20Abi, parseAbi, parseEther } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { accountFromReserves, simulate } from '@/core/simulate';
import { aaveErrorName } from '@/core/walletError';
import { faucet } from '@/devtools/forkActions';
import { asPoolAdmin } from '../../test/fork/admin';
import { publicClient, testClient, TEST_ACCOUNT, walletClient } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { advanceDays, ETHX, sendWithMargin, supplyWethCollateral, units, USDC, WETH } from '../../test/fork/position';
import { poolAbi } from './abis';

// E-Mode dibaca dari getter Pool v3.7 (tiket 14). Kategori 1 Ethereum di blok pin = "ETH correlated": jaminan WETH,
// wstETH, cbETH, rETH, weETH, osETH, ETHx (ETHx di ltvzeroBitmap), pinjaman cuma WETH. App ini read-only untuk E-Mode;
// test mengaktifkannya langsung lewat Pool.
const ETH_CORRELATED = 1;
const eModeAbi = parseAbi(['function setUserEMode(uint8 categoryId)']);
const admin = { publicClient, testClient, walletClient };

// Posisi campuran: 2 ETH (di collateralBitmap, LT/LTV kategori) + 1.000 USDC (di luar bitmap, LT/LTV reserve), E-Mode
// ETH correlated, utang 1 WETH.
async function eModePosition() {
  await supplyWethCollateral('2');
  await fundErc20(USDC, TEST_ACCOUNT, units(1_000));
  await runLikeTheApp('supply', USDC, units(1_000));
  await sendWithMargin({ address: contracts.pool, abi: eModeAbi, functionName: 'setUserEMode', args: [ETH_CORRELATED] });
  await sendWithMargin({ address: contracts.pool, abi: poolAbi, functionName: 'borrow', args: [WETH, parseEther('1'), 2n, 0, TEST_ACCOUNT] });
}

/**
 * Posisi E-Mode dengan jaminan ber-LTV 0 (tiket 14 → 17): 2 ETH + 1 ETHx, E-Mode ETH correlated, utang 0,5 WETH, ETHx
 * di `ltvzeroBitmap` kategori. Pool menolak masuk E-Mode selama ada jaminan yang LTV efektifnya 0 di kategori itu
 * (`InvalidCollateralInEmode`), jadi posisi ini cuma terjadi kalau governance memasukkan aset ke `ltvzeroBitmap` sesudah
 * user memakainya. Itu yang ditiru: masuk E-Mode, admin sebentar mengeluarkan ETHx dari bitmap (reserve-nya harus cair
 * dulu, dan kuota supply-nya dibuka), supply pertama mengaktifkan jaminannya otomatis, lalu semuanya dikembalikan.
 */
async function eModeWithLtvZeroCollateral() {
  await supplyWethCollateral('2');
  await sendWithMargin({ address: contracts.pool, abi: eModeAbi, functionName: 'setUserEMode', args: [ETH_CORRELATED] });
  const ethx = (await read()).reserves.find((r) => r.underlyingAsset === ETHX)!;
  expect(ethx.isFrozen).toBe(true);
  const configure = (call: Parameters<typeof asPoolAdmin>[2]) => asPoolAdmin(admin, AaveV3Ethereum, call);
  await configure({ functionName: 'setReserveFreeze', args: [ETHX, false] });
  await configure({ functionName: 'setAssetLtvzeroInEMode', args: [ETHX, ETH_CORRELATED, false] });
  await configure({ functionName: 'setSupplyCap', args: [ETHX, 0n] });
  await faucet(admin, { account: TEST_ACCOUNT, asset: ETHX, amount: parseEther('1') });
  await sendWithMargin({ address: ETHX, abi: erc20Abi, functionName: 'approve', args: [contracts.pool, parseEther('1')] });
  await sendWithMargin({ address: contracts.pool, abi: poolAbi, functionName: 'supply', args: [ETHX, parseEther('1'), TEST_ACCOUNT, 0] });
  await sendWithMargin({ address: contracts.pool, abi: poolAbi, functionName: 'borrow', args: [WETH, parseEther('0.5'), 2n, 0, TEST_ACCOUNT] });
  await configure({ functionName: 'setSupplyCap', args: [ETHX, ethx.supplyCap] });
  await configure({ functionName: 'setAssetLtvzeroInEMode', args: [ETHX, ETH_CORRELATED, true] });
  await configure({ functionName: 'setReserveFreeze', args: [ETHX, true] });
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

  describe('edge cases', () => {
    it('matches getUserAccountData exactly with an LTV-0 collateral in E-Mode, which cannot back new borrows', async () => {
      await eModeWithLtvZeroCollateral();
      const now = await read();

      expect(accountFromReserves(now)).toEqual(now.user!.account);
      expect(buildChainView(now, whitelist).supplies.find((s) => s.asset === ETHX)).toMatchObject({ collateral: true, canBeCollateral: false });
    });

    it('locks withdrawing WETH while ETHx (LTV 0) is collateral, exactly where the Pool refuses', async () => {
      await eModeWithLtvZeroCollateral();

      expect(simulate(await read(), whitelist, { action: 'withdraw', asset: WETH, amount: parseEther('0.1') }).ltvZero).toBe(true);
      const rejected = await publicClient
        .simulateContract({ account: TEST_ACCOUNT, address: contracts.pool, abi: poolAbi, functionName: 'withdraw', args: [WETH, parseEther('0.1'), TEST_ACCOUNT] })
        .catch((error: unknown) => error);
      expect(aaveErrorName(rejected)).toBe('LtvValidationFailed');
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
