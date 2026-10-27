import type { Address } from 'viem';

import { gasLimitFor } from '../../src/aave/gasLimit';
import { requestFor } from '../../src/aave/poolTx';
import { readChain } from '../../src/aave/readChain';
import { supportedChain } from '../../src/config/chains';
import { buildChainView } from '../../src/core/chainPosition';
import type { WalletStepName } from '../../src/core/nextStep';
import { evaluatePanel, panelAssets, panelTx, type PanelInput, type PanelState } from '../../src/core/panel';
import { publicClient, TEST_ACCOUNT, walletClient, type ForkClients } from './clients';

type Options = Partial<Pick<PanelInput, 'approvalMode' | 'riskChecked' | 'riskTyped' | 'networkFee'>> & {
  /** Dijalankan sesudah tiap langkah izin, sebelum state dibaca ulang (mis. maju waktu supaya bunga bertambah). */
  between?: () => Promise<void>;
  /** Tiap transaksi yang sukses, untuk kalibrasi gas (`core/networkFee.ts`). */
  onReceipt?: (step: WalletStepName, gasUsed: bigint) => void;
};

const panelInput = (chainId: number, tab: PanelInput['tab'], asset: Address, amount: bigint, options: Options): PanelInput => ({
  connected: true,
  txLocked: false,
  txRunning: false,
  approvalMode: options.approvalMode ?? 'exact',
  riskChecked: options.riskChecked ?? false,
  riskTyped: options.riskTyped ?? false,
  networkFee: options.networkFee ?? null,
  chainId,
  walletChainId: chainId,
  tab,
  asset,
  amount,
});

/**
 * Jalur app di Anvil test satu chain: data chain, isi panel, dan menjalankan langkah wallet seperti panel aksi. Ekspor
 * tanpa awalan di bawah = Ethereum; spec Base / Arbitrum memakai `appOn(forkClients(chainId))`.
 */
export function appOn({ chainId, publicClient, walletClient }: Pick<ForkClients, 'chainId' | 'publicClient' | 'walletClient'>) {
  const { aave: contracts, whitelist } = supportedChain(chainId);
  const read = (user: Address = TEST_ACCOUNT) => readChain(publicClient, { contracts, whitelist, user });

  /** Isi panel untuk data fork saat ini, persis seperti ActionPanel. */
  async function panelState(tab: PanelInput['tab'], asset: Address, amount: bigint, options: Options = {}): Promise<PanelState> {
    const chain = await read();
    return evaluatePanel(chain, buildChainView(chain, whitelist), whitelist, panelInput(chainId, tab, asset, amount, options));
  }

  // Jalur yang sama dengan panel aksi: baca state → evaluatePanel → kirim langkah itu → baca ulang, sampai transaksi
  // utama terkirim. Mengembalikan langkah yang dikirim ke wallet, berurutan.
  async function runLikeTheApp(tab: PanelInput['tab'], asset: Address, amount: bigint, options: Options = {}) {
    const sent: { step: WalletStepName; approveAmount?: bigint }[] = [];
    for (;;) {
      const chain = await read();
      const view = buildChainView(chain, whitelist);
      const state = evaluatePanel(chain, view, whitelist, panelInput(chainId, tab, asset, amount, options));
      const row = panelAssets(view, tab).find((r) => r.asset === asset)!;
      // Yang dikirim ke kontrak dihitung persis seperti panel (uint256.max untuk lunas/withdraw semua, arah toggle jaminan).
      const plan = panelTx(row, state, amount);
      const { step } = state;
      const permit = step.step === 'resetApproval' || step.step === 'approve' || step.step === 'delegate';
      if (!permit && step.step !== plan.main) throw new Error(`Berhenti di ${step.step}`);
      const request = requestFor(step, { contracts, asset, user: TEST_ACCOUNT, plan });
      const hash = await walletClient.writeContract({ ...request, gas: await gasLimitFor(publicClient, request, TEST_ACCOUNT) } as never);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe('success');
      options.onReceipt?.(step.step, receipt.gasUsed);
      sent.push(step.step === 'approve' || step.step === 'delegate' ? { step: step.step, approveAmount: step.amount } : { step: step.step });
      if (step.step === plan.main) return sent;
      await options.between?.();
    }
  }

  return { chainId, contracts, whitelist, read, panelState, runLikeTheApp };
}

export const { contracts, whitelist, read, panelState, runLikeTheApp } = appOn({ chainId: 1, publicClient, walletClient });
