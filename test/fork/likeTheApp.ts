import type { Address } from 'viem';

import { gasLimitFor } from '../../src/aave/gasLimit';
import { poolRequest } from '../../src/aave/poolTx';
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

type Options = Partial<Pick<PanelInput, 'approvalMode' | 'riskChecked' | 'riskTyped'>>;

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
    const { main, send, useAsCollateral } = panelTx(row, state, amount);
    const { step } = state;
    if (step.step !== 'resetApproval' && step.step !== 'approve' && step.step !== main) throw new Error(`Berhenti di ${step.step}`);
    const request = poolRequest(step, { pool: contracts.pool, asset, amount: send, user: TEST_ACCOUNT, useAsCollateral });
    const hash = await walletClient.writeContract({ ...request, gas: await gasLimitFor(publicClient, request, TEST_ACCOUNT) } as never);
    expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
    sent.push(step.step === 'approve' ? { step: step.step, approveAmount: step.amount } : { step: step.step });
    if (step.step === main) return sent;
  }
}
