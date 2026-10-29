import { parseEther } from 'viem';

import { STEP_GAS, TYPICAL_ACTION_GAS, typicalActionFee } from '@/core/networkFee';
import type { WalletStepName } from '@/core/nextStep';
import { buildChainView } from '@/core/chainPosition';
import { panelAssets, panelTx, type PanelTab } from '@/core/panel';
import { publicClient, TEST_ACCOUNT, testClient } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { contracts, panelState, read, runLikeTheApp, whitelist } from '../../test/fork/likeTheApp';
import { units, USDC, WETH } from '../../test/fork/position';
import { fetchNetworkFee, fetchTypicalActionFee } from './fetchNetworkFee';
import { isWalletStep } from '@/core/nextStep';

const confirmed = { riskChecked: true, riskTyped: true };

// Biaya yang dihitung app untuk langkah yang tersisa, lewat jalur yang sama dengan useNetworkFee.
async function appFee(tab: PanelTab, asset: typeof USDC, amount: bigint) {
  const state = await panelState(tab, asset, amount, confirmed);
  const row = panelAssets(buildChainView(await read(), whitelist), tab).find((r) => r.asset === asset)!;
  const step = state.stepBeforeGasCheck;
  if (!isWalletStep(step)) throw new Error(`Bukan langkah wallet: ${step.step}`);
  const fee = await fetchNetworkFee(publicClient, { chainId: 1, contracts, account: TEST_ACCOUNT, asset, step, plan: panelTx(row, state, amount) });
  // Ethereum: tanpa L1 fee terpisah.
  expect(fee.l1Fee).toBe(0n);
  return fee.wei;
}

describe('Biaya jaringan (fork Ethereum)', () => {
  describe('positive', () => {
    // Batas atas STEP_GAS dipakai untuk transaksi utama yang belum bisa diestimasi; harus menutup gasUsed asli (termasuk
    // posisi dengan utang dan dua jaminan, yang memeriksa HF), tanpa terlalu jauh di atasnya.
    it('STEP_GAS covers the gasUsed of every step the app sends, and stays within 30% of the largest', async () => {
      const used: Partial<Record<WalletStepName, bigint[]>> = {};
      const onReceipt = (step: WalletStepName, gas: bigint) => void (used[step] = [...(used[step] ?? []), gas]);

      await fundErc20(USDC, TEST_ACCOUNT, units(5_000));
      await runLikeTheApp('supply', USDC, units(3_000), { onReceipt });
      await runLikeTheApp('supply', WETH, parseEther('1'), { onReceipt });
      await runLikeTheApp('borrow', WETH, parseEther('0.3'), { ...confirmed, onReceipt });
      await runLikeTheApp('borrow', USDC, units(500), { ...confirmed, onReceipt });
      await runLikeTheApp('withdraw', WETH, parseEther('0.2'), { ...confirmed, onReceipt });
      await runLikeTheApp('withdraw', USDC, units(200), { ...confirmed, onReceipt });
      await runLikeTheApp('collateral', USDC, 0n, { ...confirmed, onReceipt });
      await runLikeTheApp('repay', USDC, units(5_000), { ...confirmed, onReceipt });
      await runLikeTheApp('repay', WETH, parseEther('0.1'), { ...confirmed, onReceipt });

      expect(Object.keys(used).sort()).toEqual(['approve', 'borrow', 'delegate', 'repay', 'setCollateral', 'supply', 'withdraw']);
      for (const [step, gases] of Object.entries(used) as [WalletStepName, bigint[]][]) {
        const max = gases.reduce((a, b) => (a > b ? a : b));
        expect([step, max <= STEP_GAS[step]]).toEqual([step, true]);
        expect([step, STEP_GAS[step] * 10n <= max * 13n]).toEqual([step, true]);
      }
      // Badge kartu chain: satu aksi tipikal = approve + supply ERC20 pertama, atau borrow.
      const maxOf = (gases: bigint[]) => gases.reduce((a, b) => (a > b ? a : b));
      expect(used.approve![0] + used.supply![0]).toBeLessThanOrEqual(TYPICAL_ACTION_GAS);
      expect(maxOf(used.borrow!)).toBeLessThanOrEqual(TYPICAL_ACTION_GAS);
    });

    it('prices the chain card badge from the current gas price', async () => {
      const gasPrice = await publicClient.getGasPrice();
      expect(gasPrice).toBeGreaterThan(0n);
      expect(await fetchTypicalActionFee(publicClient)).toBe(typicalActionFee(gasPrice));
    });

    it('estimates approve + supply before sending, and the real cost stays within it', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(1_000));
      const fee = await appFee('supply', USDC, units(1_000));

      expect(await runLikeTheApp('supply', USDC, units(1_000))).toEqual([{ step: 'approve', approveAmount: units(1_000) }, { step: 'supply' }]);
      let cost = 0n;
      // Dua blok terakhir = approve + supply (Anvil automine, satu tx per blok).
      const latest = await publicClient.getBlockNumber();
      for (const blockNumber of [latest - 1n, latest]) {
        const block = await publicClient.getBlock({ blockNumber });
        const receipt = await publicClient.getTransactionReceipt({ hash: block.transactions[0] });
        cost += receipt.gasUsed * receipt.effectiveGasPrice;
      }
      expect(cost).toBeLessThanOrEqual(fee);
      expect(fee).toBeLessThan(cost * 2n);
    });
  });

  describe('negative', () => {
    it('locks the button when the wallet ETH (read on-chain) cannot pay the estimated fee', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(1_000));
      const fee = await appFee('supply', USDC, units(1_000));
      await testClient.setBalance({ address: TEST_ACCOUNT, value: fee - 1n });

      expect((await panelState('supply', USDC, units(1_000), { networkFee: fee })).step).toEqual({ step: 'needsEthForGas', needed: fee });
      await testClient.setBalance({ address: TEST_ACCOUNT, value: 0n });
      expect((await panelState('supply', USDC, units(1_000))).step).toEqual({ step: 'needsEthForGas', needed: null });
    });
  });
});
