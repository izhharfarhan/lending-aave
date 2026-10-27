import { erc20Abi, maxUint256, type Address } from 'viem';

import { WHITELIST } from '@/config/assets';
import { AAVE } from '@/config/contracts';
import { buildChainView, type ChainRead } from '@/core/chainPosition';
import { nextStep, type NextStepInput, type WalletStepName } from '@/core/nextStep';
import { aaveErrorName } from '@/core/walletError';
import { publicClient, TEST_ACCOUNT, walletClient } from '../../test/fork/clients';
import { fundErc20 } from '../../test/fork/fund';
import { gasLimitFor } from './gasLimit';
import { readChain } from './readChain';
import { supplyRequest } from './supplyTx';

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const contracts = AAVE[1];
const whitelist = WHITELIST[1];
const units = (n: number) => BigInt(n) * 1_000_000n;

const read = () => readChain(publicClient, { contracts, whitelist, user: TEST_ACCOUNT });
// Masukan nextStep diambil dari baris Pasar supply, persis seperti panel aksi.
const stepFor = (chain: ChainRead, asset: Address, amount: bigint, approvalMode: NextStepInput['approvalMode']) => {
  const row = buildChainView(chain, whitelist).supplyMarket.find((r) => r.asset === asset)!;
  return nextStep({
    connected: true,
    txLocked: false,
    data: 'ready',
    txRunning: false,
    amount,
    balance: row.walletBalance!,
    allowance: row.allowance!,
    approvalMode,
    requiresApprovalReset: row.requiresApprovalReset,
  });
};

// Jalur yang sama dengan panel aksi: baca state → nextStep → kirim langkah itu → baca ulang, sampai supply terkirim.
// Mengembalikan langkah yang dikirim ke wallet, berurutan.
async function supplyLikeTheApp(asset: Address, amount: bigint, approvalMode: NextStepInput['approvalMode'] = 'exact') {
  const sent: { step: WalletStepName; approveAmount?: bigint }[] = [];
  for (;;) {
    const step = stepFor(await read(), asset, amount, approvalMode);
    if (step.step !== 'resetApproval' && step.step !== 'approve' && step.step !== 'supply') throw new Error(`Berhenti di ${step.step}`);
    const request = supplyRequest(step, { pool: contracts.pool, asset, amount, user: TEST_ACCOUNT });
    const hash = await walletClient.writeContract({ ...request, gas: await gasLimitFor(publicClient, request, TEST_ACCOUNT) } as never);
    expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
    sent.push(step.step === 'approve' ? { step: step.step, approveAmount: step.amount } : { step: step.step });
    if (step.step === 'supply') return sent;
  }
}

const allowanceToPool = (asset: Address) =>
  publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'allowance', args: [TEST_ACCOUNT, contracts.pool] });

describe('supply ERC20 (fork Ethereum)', () => {
  describe('positive', () => {
    it('supplies 1.000 USDC with an exact approve, leaving no allowance and turning it into collateral', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(5_000));

      const sent = await supplyLikeTheApp(USDC, units(1_000));
      const after = await read();
      const view = buildChainView(after, whitelist);

      expect(sent).toEqual([{ step: 'approve', approveAmount: units(1_000) }, { step: 'supply' }]);
      expect(after.user!.walletBalances[USDC]).toBe(units(4_000));
      expect(await allowanceToPool(USDC)).toBe(0n);
      // aToken dibulatkan ke bawah oleh kontrak: boleh kurang 1 unit terkecil, nggak boleh lebih.
      const row = view.supplies.find((r) => r.asset === USDC)!;
      expect(units(1_000) - row.amount).toBeGreaterThanOrEqual(0n);
      expect(units(1_000) - row.amount).toBeLessThanOrEqual(1n);
      // Supply pertama aset yang boleh jadi jaminan otomatis aktif sebagai jaminan.
      expect(row.collateral).toBe(true);
      expect(view.account!.totalCollateralUsd).toBeGreaterThan(990);
    });

    // Supply kedua juga yang dulu kehabisan gas tanpa margin (lihat core/gasMargin.ts).
    it('skips the approve on the next supply after the user chose unlimited', async () => {
      await fundErc20(USDC, TEST_ACCOUNT, units(5_000));

      expect(await supplyLikeTheApp(USDC, units(1_000), 'unlimited')).toEqual([
        { step: 'approve', approveAmount: maxUint256 },
        { step: 'supply' },
      ]);
      expect(await supplyLikeTheApp(USDC, units(500), 'unlimited')).toEqual([{ step: 'supply' }]);
    });
  });

  describe('edge case', () => {
    it('resets a leftover USDT allowance to 0 before approving the exact amount', async () => {
      await fundErc20(USDT, TEST_ACCOUNT, units(5_000));
      // Sisa izin dari supply lama yang gagal/batal.
      const hash = await walletClient.writeContract({ address: USDT, abi: erc20Abi, functionName: 'approve', args: [contracts.pool, units(30)] });
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await supplyLikeTheApp(USDT, units(1_000))).toEqual([
        { step: 'resetApproval' },
        { step: 'approve', approveAmount: units(1_000) },
        { step: 'supply' },
      ]);
      expect(await allowanceToPool(USDT)).toBe(0n);
    });
  });

  describe('negative', () => {
    it('decodes an Aave revert into its custom error name for translation', async () => {
      const request = supplyRequest({ step: 'supply' }, { pool: contracts.pool, asset: USDC, amount: 0n, user: TEST_ACCOUNT });
      const error = await publicClient.simulateContract({ ...request, account: TEST_ACCOUNT }).catch((e: unknown) => e);

      expect(aaveErrorName(error)).toBe('InvalidAmount');
    });
  });
});
