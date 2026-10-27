import { erc20Abi, parseAbi, parseEther, type Address } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { accountFromReserves, simulate } from '@/core/simulate';
import { aaveErrorName } from '@/core/walletError';
import { publicClient, TEST_ACCOUNT, testClient, walletClient } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, panelState, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { poolAbi } from './abis';
import { gasLimitFor } from './gasLimit';
import { poolRequest } from './poolTx';

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const units = (n: number) => BigInt(Math.round(n * 1e6));
const wethAbi = parseAbi(['function deposit() payable']);

// Jaminan ETH disiapkan langsung lewat Pool sebagai WETH: supply ETH lewat gateway baru ada di tiket 06.
async function supplyWethCollateral(eth: string) {
  const value = parseEther(eth);
  const send = async (hash: Promise<`0x${string}`>) => publicClient.waitForTransactionReceipt({ hash: await hash });
  await send(walletClient.writeContract({ address: WETH, abi: wethAbi, functionName: 'deposit', value }));
  await send(walletClient.writeContract({ address: WETH, abi: erc20Abi, functionName: 'approve', args: [contracts.pool, value] }));
  await send(walletClient.writeContract({ address: contracts.pool, abi: poolAbi, functionName: 'supply', args: [WETH, value, TEST_ACCOUNT, 0] }));
}

async function advanceDays(days: number) {
  await testClient.increaseTime({ seconds: days * 24 * 60 * 60 });
  await testClient.mine({ blocks: 1 });
}

describe('borrow & repay ERC20 (fork Ethereum)', () => {
  describe('positive', () => {
    it('borrows USDC against ETH collateral and lands on the simulated HF', async () => {
      await supplyWethCollateral('1');
      // 1 ETH × $2.306,77 × LT 83% ÷ 1.000 USDC → HF ≈ 1,91: Waspada, cukup diperingatkan (tanpa centang).
      const { sim, step } = await panelState('borrow', USDC, units(1_000));
      expect(sim?.gate).toBe('warn');
      expect(step).toEqual({ step: 'borrow' });

      expect(await runLikeTheApp('borrow', USDC, units(1_000))).toEqual([{ step: 'borrow' }]);
      const after = await read();

      expect(after.user!.walletBalances[USDC]).toBe(units(1_000));
      // Selisihnya cuma bunga beberapa detik antara simulasi dan blok borrow.
      expect(Number(after.user!.account.healthFactor) / 1e18).toBeCloseTo(sim!.account.healthFactor!, 6);
    });

    it('repays part of the debt, then all of it with type(uint256).max, leaving no interest dust', async () => {
      await supplyWethCollateral('1');
      await runLikeTheApp('borrow', USDC, units(500));
      await fundErc20(USDC, TEST_ACCOUNT, units(100));

      expect(await runLikeTheApp('repay', USDC, units(200))).toEqual([{ step: 'approve', approveAmount: units(200) }, { step: 'repay' }]);

      // Bunga 30 hari bikin utang lebih besar dari angka yang terakhir dilihat user.
      await advanceDays(30);
      const debt = buildChainView(await read(), whitelist).borrows.find((r) => r.asset === USDC)!.amount;
      const { plan } = await panelState('repay', USDC, debt);
      expect(plan?.full).toBe(true);

      const sent = await runLikeTheApp('repay', USDC, debt);
      const after = await read();

      // Izin berbantalan = utang + bunga 1 hari, bukan exact utang yang dibaca.
      expect(sent).toEqual([{ step: 'approve', approveAmount: plan!.spend }, { step: 'repay' }]);
      expect(plan!.spend).toBeGreaterThan(debt);
      expect(after.user!.reserves.find((r) => r.underlyingAsset === USDC)!.scaledVariableDebt).toBe(0n);
      expect(after.user!.account.totalDebtBase).toBe(0n);
    });
  });

  describe('negative', () => {
    // Tombol "Melebihi batas pinjam" (#9 locked) harus terkunci persis di tempat kontrak mulai menolak.
    it('locks the borrow exactly where the Pool starts rejecting it', async () => {
      await supplyWethCollateral('1');
      const chain = await read();
      const overLtv = (amount: bigint) => simulate(chain, whitelist, { action: 'borrow', asset: USDC, amount }).overLtv;
      // Jumlah terbesar yang belum melewati batas LTV menurut modul domain.
      let low = 0n;
      let high = units(10_000);
      while (high - low > 1n) {
        const mid = (low + high) / 2n;
        if (overLtv(mid)) high = mid;
        else low = mid;
      }
      const estimate = (amount: bigint) => {
        const request = poolRequest({ step: 'borrow' }, { pool: contracts.pool, asset: USDC, amount, user: TEST_ACCOUNT });
        return gasLimitFor(publicClient, request, TEST_ACCOUNT);
      };

      await expect(estimate(low)).resolves.toBeGreaterThan(0n);
      // 0,01% di atas batas: bunga jaminan beberapa detik antara baca dan estimasi nggak cukup menutupinya.
      const error = await estimate((low * 10_001n) / 10_000n).catch((e: unknown) => e);
      expect(aaveErrorName(error)).toBe('CollateralCannotCoverNewBorrow');
    });
  });

  // Paritas (seam 3): modul domain menghitung ulang getUserAccountData dari data per reserve. Dibaca di satu
  // multicall, blok yang sama, jadi harus sama persis tanpa toleransi.
  describe('parity with getUserAccountData', () => {
    const REAL_POSITIONS: Record<string, Address> = {
      ethCollateralStableDebt: '0x898Ae2fA55497587BEcb740a7f4E18220dDbf9A9',
      waspada: '0x7Cdc43434a6402040EA8770c2458BB57F646a86d',
      withOutsideAssets: '0xd28E7c36381c17fDe2635529526B0F6303B30F75',
      ethBothSidesOutsideNonCollateral: '0xEbaEA2Eb91d2c2A10E3D7dA528bae36312d627f0',
    };

    it.each(Object.entries(REAL_POSITIONS))('matches for the real %s position, also after 90 days of interest', async (_label, user) => {
      const now = await read(user);
      expect(accountFromReserves(now)).toEqual(now.user!.account);

      await advanceDays(90);
      const later = await read(user);
      expect(later.user!.account.totalDebtBase).toBeGreaterThan(now.user!.account.totalDebtBase);
      expect(accountFromReserves(later)).toEqual(later.user!.account);
    });

    it('matches for a mixed position built through the app: ETH + USDC collateral, USDC + USDT debt', async () => {
      await supplyWethCollateral('2');
      await fundErc20(USDC, TEST_ACCOUNT, units(3_000));
      await runLikeTheApp('supply', USDC, units(3_000));
      await runLikeTheApp('borrow', USDC, units(1_500));
      await runLikeTheApp('borrow', USDT, units(1_000));
      await advanceDays(7);

      const chain = await read();
      expect(accountFromReserves(chain)).toEqual(chain.user!.account);
    });
  });
});
