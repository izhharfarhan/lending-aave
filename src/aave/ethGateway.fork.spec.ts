import { parseEther } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { publicClient, TEST_ACCOUNT } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, panelState, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { advanceDays, sendWithMargin, units, USDC, WETH } from '../../test/fork/position';
import { poolAbi } from './abis';

const ethBalance = () => publicClient.getBalance({ address: TEST_ACCOUNT });
const ethRow = async () => buildChainView(await read(), whitelist);

// Biaya gas tx terakhir (Anvil automine: satu tx per blok), untuk memisahkan ETH yang dibayar ke Aave dari biaya jaringan.
async function lastTxFee() {
  const block = await publicClient.getBlock({ blockTag: 'latest' });
  const receipt = await publicClient.getTransactionReceipt({ hash: block.transactions[0] });
  return receipt.gasUsed * receipt.effectiveGasPrice;
}

// Utang ETH disiapkan langsung lewat Pool (pinjam WETH): borrow ETH lewat gateway baru ada di tiket 07.
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
    it('blocks supplying more ETH than the wallet holds before any wallet popup', async () => {
      const balance = await ethBalance();

      expect((await panelState('supply', WETH, balance + 1n)).step).toEqual({ step: 'insufficientBalance' });
    });
  });
});
