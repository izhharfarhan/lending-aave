import { erc20Abi, maxUint256, parseEther } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { publicClient, TEST_ACCOUNT } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, panelState, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { advanceDays, advanceHours, sendWithMargin, units, USDC, WETH } from '../../test/fork/position';
import { debtTokenAbi, gatewayAbi, poolAbi } from './abis';

const ethBalance = () => publicClient.getBalance({ address: TEST_ACCOUNT });
const ethRow = async () => buildChainView(await read(), whitelist);
const ethSupplied = async () => (await ethRow()).supplies.find((r) => r.symbol === 'ETH')?.amount ?? 0n;
const scaledAWeth = async () => (await read()).user!.reserves.find((r) => r.underlyingAsset === WETH)!.scaledATokenBalance;
const aWethAllowance = () =>
  publicClient.readContract({ address: contracts.aWeth, abi: erc20Abi, functionName: 'allowance', args: [TEST_ACCOUNT, contracts.wrappedTokenGateway] });

// Biaya gas tx terakhir (Anvil automine: satu tx per blok), untuk memisahkan ETH yang dibayar ke Aave dari biaya jaringan.
async function lastTxFee() {
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  const receipt = await publicClient.getTransactionReceipt({ hash: block.transactions[0] });
  return receipt.gasUsed * receipt.effectiveGasPrice;
}

// Utang ETH disiapkan langsung lewat Pool (pinjam WETH): setup cepat untuk test repay.
async function ethDebt(eth: string) {
  await fundErc20(USDC, TEST_ACCOUNT, units(5_000));
  await runLikeTheApp('supply', USDC, units(5_000));
  await sendWithMargin({ address: contracts.pool, abi: poolAbi, functionName: 'borrow', args: [WETH, parseEther(eth), 2n, 0, TEST_ACCOUNT] });
}

describe('ETH lewat WrappedTokenGateway (fork Ethereum)', () => {
  describe('positive', () => {
    it('supplies 1 ETH in one transaction, no approve, shown as one ETH collateral row', async () => {
      const before = await ethBalance();

      expect(await runLikeTheApp('supply', WETH, parseEther('1'))).toEqual([{ step: 'supply' }]);
      const fee = await lastTxFee();
      const view = await ethRow();

      expect(before - (await ethBalance())).toBe(parseEther('1') + fee);
      // WETH tampil sebagai ETH, satu baris, langsung jadi jaminan; aToken dibulatkan ke bawah paling banyak 1 wei.
      expect(view.supplies.map((r) => r.symbol)).toEqual(['ETH']);
      expect(parseEther('1') - view.supplies[0].amount).toBeLessThanOrEqual(1n);
      expect(view.supplies[0].collateral).toBe(true);
    });

    it('repays part of an ETH debt with exactly the typed ETH', async () => {
      await ethDebt('0.5');
      const debtBefore = (await ethRow()).borrows.find((r) => r.symbol === 'ETH')!.amount;
      const before = await ethBalance();

      expect(await runLikeTheApp('repay', WETH, parseEther('0.1'))).toEqual([{ step: 'repay' }]);
      const fee = await lastTxFee();

      expect(before - (await ethBalance())).toBe(parseEther('0.1') + fee);
      const debtAfter = (await ethRow()).borrows.find((r) => r.symbol === 'ETH')!.amount;
      // Selisih di luar 0,1 ETH = bunga beberapa detik antara dua pembacaan.
      expect(debtBefore - parseEther('0.1') - debtAfter).toBeLessThanOrEqual(parseEther('0.000001'));
    });

    it('repays a whole ETH debt with type(uint256).max: sends debt + cushion, gets the excess back, no dust', async () => {
      await ethDebt('0.5');
      await advanceDays(30);
      const debt = (await ethRow()).borrows.find((r) => r.symbol === 'ETH')!.amount;
      const { repay } = await panelState('repay', WETH, debt);
      expect(repay?.full).toBe(true);
      const before = await ethBalance();

      expect(await runLikeTheApp('repay', WETH, debt)).toEqual([{ step: 'repay' }]);
      const paid = before - (await ethBalance()) - (await lastTxFee());

      expect((await read()).user!.reserves.find((r) => r.underlyingAsset === WETH)!.scaledVariableDebt).toBe(0n);
      // Yang benar-benar terbayar = utang saat tx dieksekusi: ≥ utang yang dilihat, < yang dikirim (sisanya kembali).
      expect(paid).toBeGreaterThanOrEqual(debt);
      expect(paid).toBeLessThan(repay!.spend);
      expect(await publicClient.getBalance({ address: contracts.wrappedTokenGateway })).toBe(0n);
    });

    it('withdraws part of the ETH supply: exact aWETH approve to the gateway, then ETH lands in the wallet', async () => {
      await runLikeTheApp('supply', WETH, parseEther('1'));
      let approved = 0n;

      const sent = await runLikeTheApp('withdraw', WETH, parseEther('0.4'), { between: async () => void (approved = await ethBalance()) });

      expect(sent).toEqual([{ step: 'approve', approveAmount: parseEther('0.4') }, { step: 'withdraw' }]);
      expect((await ethBalance()) - approved + (await lastTxFee())).toBe(parseEther('0.4'));
      // Izin exact habis terpakai (paling banyak sisa 1 wei pembulatan aToken).
      expect(parseEther('0.6') - (await ethSupplied())).toBeLessThanOrEqual(1n);
      expect(await aWethAllowance()).toBeLessThanOrEqual(1n);
    });

    it('withdraws all ETH with type(uint256).max after interest accrued, leaving no aWETH dust', async () => {
      await runLikeTheApp('supply', WETH, parseEther('1'));
      await advanceDays(30);
      const supplied = await ethSupplied();
      const { withdraw } = await panelState('withdraw', WETH, supplied);
      expect(withdraw?.all).toBe(true);
      let approved = 0n;

      // Bunga terus bertambah antara approve dan withdraw (1 jam di sini): izin berbantalan tetap cukup.
      const sent = await runLikeTheApp('withdraw', WETH, supplied, {
        between: async () => {
          await advanceHours(1);
          approved = await ethBalance();
        },
      });

      expect(sent).toEqual([{ step: 'approve', approveAmount: withdraw!.spend }, { step: 'withdraw' }]);
      expect(await scaledAWeth()).toBe(0n);
      // Yang diterima = seluruh saldo saat eksekusi, termasuk bunga 1 jam sesudah saldo dibaca.
      const received = (await ethBalance()) - approved + (await lastTxFee());
      expect(received).toBeGreaterThan(supplied);
      expect(received).toBeLessThanOrEqual(withdraw!.spend);
      expect(await publicClient.getBalance({ address: contracts.wrappedTokenGateway })).toBe(0n);
    });

    it('borrows ETH after a credit delegation to the gateway; the ETH lands in the wallet and the debt is the user\'s', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(5_000));
      await runLikeTheApp('supply', USDC, units(5_000));
      let delegated = 0n;

      const sent = await runLikeTheApp('borrow', WETH, parseEther('0.3'), { between: async () => void (delegated = await ethBalance()) });

      expect(sent).toEqual([{ step: 'delegate', approveAmount: parseEther('0.3') }, { step: 'borrow' }]);
      expect((await ethBalance()) - delegated + (await lastTxFee())).toBe(parseEther('0.3'));
      const debt = (await ethRow()).borrows.find((r) => r.symbol === 'ETH')!.amount;
      expect(debt - parseEther('0.3')).toBeLessThanOrEqual(parseEther('0.000001'));
      // Delegation exact habis terpakai: gateway nggak bisa berutang lagi atas nama user.
      const left = await publicClient.readContract({
        address: contracts.variableDebtWeth,
        abi: debtTokenAbi,
        functionName: 'borrowAllowance',
        args: [TEST_ACCOUNT, contracts.wrappedTokenGateway],
      });
      expect(left).toBe(0n);
    });
  });

  describe('edge case', () => {
    it('treats an amount above the ETH debt as a full repay: the gateway takes only the debt and refunds the rest', async () => {
      await ethDebt('0.2');
      const debt = (await ethRow()).borrows.find((r) => r.symbol === 'ETH')!.amount;
      const typed = parseEther('0.5');
      const before = await ethBalance();

      expect(await runLikeTheApp('repay', WETH, typed)).toEqual([{ step: 'repay' }]);
      const paid = before - (await ethBalance()) - (await lastTxFee());

      expect((await read()).user!.reserves.find((r) => r.underlyingAsset === WETH)!.scaledVariableDebt).toBe(0n);
      expect(paid).toBeGreaterThanOrEqual(debt);
      expect(paid).toBeLessThan(typed);
    });
  });

  describe('negative', () => {
    it('V2: withdrawETH(max) with an aWETH approve of exactly the current balance fails once interest accrues', async () => {
      await runLikeTheApp('supply', WETH, parseEther('1'));
      await advanceDays(1);
      await sendWithMargin({ address: contracts.aWeth, abi: erc20Abi, functionName: 'approve', args: [contracts.wrappedTokenGateway, await ethSupplied()] });
      await advanceDays(1);

      await expect(
        publicClient.simulateContract({
          account: TEST_ACCOUNT,
          address: contracts.wrappedTokenGateway,
          abi: gatewayAbi,
          functionName: 'withdrawETH',
          args: [contracts.pool, maxUint256, TEST_ACCOUNT],
        }),
      ).rejects.toThrow();
    });

    it('blocks supplying more ETH than the wallet holds before any wallet popup', async () => {
      const balance = await ethBalance();

      expect((await panelState('supply', WETH, balance + 1n)).step).toEqual({ step: 'insufficientBalance' });
    });
  });
});
