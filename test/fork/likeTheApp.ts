import type { Address } from 'viem';

import { gasLimitFor } from '../../src/aave/gasLimit';
import { requestFor } from '../../src/aave/poolTx';
import { readChain } from '../../src/aave/readChain';
import { WHITELIST } from '../../src/config/assets';
import { AAVE } from '../../src/config/contracts';
import { buildChainView } from '../../src/core/chainPosition';
import type { WalletStepName } from '../../src/core/nextStep';
import { evaluatePanel, panelAssets, panelTx, type PanelInput, type PanelState } from '../../src/core/panel';
import { publicClient, TEST_ACCOUNT, walletClient } from './clients';

export const contracts = AAVE[1];
export const whitelist = WHITELIST[1];

export const read = (user: Address = TEST_ACCOUNT) => readChain(publicClient, { contracts, whitelist, user });

type Options = Partial<Pick<PanelInput, 'approvalMode' | 'riskChecked' | 'riskTyped' | 'networkFee'>> & {
  /** Dijalankan sesudah tiap langkah izin, sebelum state dibaca ulang (mis. maju waktu supaya bunga bertambah). */
  between?: () => Promise<void>;
  /** Tiap transaksi yang sukses, untuk kalibrasi gas (`core/networkFee.ts`). */
  onReceipt?: (step: WalletStepName, gasUsed: bigint) => void;
};

/** Isi panel untuk data fork saat ini, persis seperti ActionPanel. */
export async function panelState(tab: PanelInput['tab'], asset: Address, amount: bigint, options: Options = {}): Promise<PanelState> {
  const chain = await read();
  return evaluatePanel(chain, buildChainView(chain, whitelist), whitelist, panelInput(tab, asset, amount, options));
}

const panelInput = (tab: PanelInput['tab'], asset: Address, amount: bigint, options: Options): PanelInput => ({
  connected: true,
  txLocked: false,
  txRunning: false,
  approvalMode: options.approvalMode ?? 'exact',
  riskChecked: options.riskChecked ?? false,
  riskTyped: options.riskTyped ?? false,
  networkFee: options.networkFee ?? null,
  tab,
  asset,
  amount,
});

// Jalur yang sama dengan panel aksi: baca state → evaluatePanel → kirim langkah itu → baca ulang, sampai transaksi
// utama terkirim. Mengembalikan langkah yang dikirim ke wallet, berurutan.
export async function runLikeTheApp(tab: PanelInput['tab'], asset: Address, amount: bigint, options: Options = {}) {
  const sent: { step: WalletStepName; approveAmount?: bigint }[] = [];
  for (;;) {
    const chain = await read();
    const view = buildChainView(chain, whitelist);
    const state = evaluatePanel(chain, view, whitelist, panelInput(tab, asset, amount, options));
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
