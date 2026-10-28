import { erc20Abi, parseEther, type Address } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { publicClient, testClient, TEST_ACCOUNT } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { ETHX, supplyWethCollateral, units, USDC } from '../../test/fork/position';
import { aaveErrorName } from '@/core/walletError';
import { advanceTime, faucet, setUserEMode, TIME_STEPS } from './forkActions';

const clients = { publicClient, testClient };
const balanceOf = (token: Address) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [TEST_ACCOUNT] });
const latestTimestamp = async () => (await publicClient.getBlock()).timestamp;

describe('Dev Tools fork actions (fork Ethereum)', () => {
  describe('positive', () => {
    it('moves the chain clock forward by the chosen step and mines a block, so debt accrues interest', async () => {
      await supplyWethCollateral('2');
      await runLikeTheApp('borrow', USDC, units(1_000));
      const before = await read();
      const debtBefore = buildChainView(before, whitelist).borrows[0].amount;

      await advanceTime(clients, TIME_STEPS.month);

      const after = await read();
      // Jam Anvil ikut berjalan selama test, jadi cukup "minimal 30 hari, nggak jauh lebih".
      expect(after.blockTimestamp - before.blockTimestamp).toBeGreaterThanOrEqual(BigInt(TIME_STEPS.month));
      expect(after.blockTimestamp - before.blockTimestamp).toBeLessThan(BigInt(TIME_STEPS.month + 120));
      expect(buildChainView(after, whitelist).borrows[0].amount).toBeGreaterThan(debtBefore);
      expect(after.user!.account.healthFactor).toBeLessThan(before.user!.account.healthFactor);
    });

    it('adds ETH to the wallet', async () => {
      const before = await publicClient.getBalance({ address: TEST_ACCOUNT });

      await faucet(clients, { account: TEST_ACCOUNT, asset: 'native', amount: parseEther('10') });

      expect(await publicClient.getBalance({ address: TEST_ACCOUNT })).toBe(before + parseEther('10'));
    });

    // ETHx bukan aset whitelist; faucet tetap harus bisa (dipakai test paritas E-Mode ltvzero, tiket 14).
    it('adds an ERC20 on top of what the wallet already holds, also for a token outside the whitelist', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(500));
      const [usdc, ethx] = [await balanceOf(USDC), await balanceOf(ETHX)];
      expect(usdc).toBeGreaterThanOrEqual(units(500));

      await faucet(clients, { account: TEST_ACCOUNT, asset: USDC, amount: units(1_000) });
      await faucet(clients, { account: TEST_ACCOUNT, asset: ETHX, amount: parseEther('2') });

      expect(await balanceOf(USDC)).toBe(usdc + units(1_000));
      expect(await balanceOf(ETHX)).toBe(ethx + parseEther('2'));
    });

    // Cek baris E-Mode di browser (tiket 14): app-nya read-only untuk E-Mode, jadi akun tes dimasukkan lewat Dev Tools.
    it('puts the account into an E-Mode category and back out', async () => {
      await supplyWethCollateral('2');

      await setUserEMode(clients, { pool: contracts.pool, account: TEST_ACCOUNT, categoryId: 1 });
      expect((await read()).user!.eMode?.id).toBe(1);

      await setUserEMode(clients, { pool: contracts.pool, account: TEST_ACCOUNT, categoryId: 0 });
      expect((await read()).user!.eMode).toBeNull();
    });
  });

  describe('negative', () => {
    it('refuses with the Pool error when a debt is not borrowable in the category, leaving E-Mode unchanged', async () => {
      await supplyWethCollateral('2');
      await runLikeTheApp('borrow', USDC, units(100));

      const error = await setUserEMode(clients, { pool: contracts.pool, account: TEST_ACCOUNT, categoryId: 1 }).catch((e: unknown) => e);
      expect(aaveErrorName(error)).toBe('InvalidDebtInEmode');
      expect((await read()).user!.eMode).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('has the three steps of the spec: +1 day, +30 days, +1 year', () => {
      expect(TIME_STEPS).toEqual({ day: 86_400, month: 30 * 86_400, year: 365 * 86_400 });
    });
  });
});
