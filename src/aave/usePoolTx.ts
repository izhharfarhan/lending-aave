import { useState } from 'react';
import type { Address } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';

import { AAVE } from '@/config/contracts';
import type { NextStep } from '@/core/nextStep';
import type { PanelTx } from '@/core/panel';
import { gasLimitFor } from './gasLimit';
import { plannedSteps, requestFor, type WalletStep } from './poolTx';
import { useAddLocalHistory } from './useLocalHistory';
import { runWalletSteps, type TxState, type WalletStepsStart } from './walletSteps';

export type { TxState } from './walletSteps';

type PoolTxArgs = {
  chainId: number;
  user: Address | undefined;
  asset: { address: Address; symbol: string; decimals: number };
  /** Transaksi utama, jumlah yang dikirim/dicatat, dan jalur ETH (dari `panelTx`). */
  plan: PanelTx;
  /** Baca ulang posisi + izin, lalu hitung nextStep dari data baru itu. Harus melempar kalau pembacaan gagal. */
  refreshStep: () => Promise<NextStep>;
};

export function usePoolTx({ chainId, user, asset, plan, refreshStep }: PoolTxArgs) {
  const { main, historyKind, shown: amount } = plan;
  const [tx, setTx] = useState<TxState>({ status: 'idle' });
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId });
  const addHistory = useAddLocalHistory(chainId, user);

  // `shown` = jumlah transaksi utama; "Cek status lagi" memakai jumlah saat dikirim, bukan hitungan panel sekarang.
  async function start(from: WalletStepsStart, shown = amount) {
    if (!user || !client) return;
    await runWalletSteps(
      {
        client,
        main,
        kind: historyKind,
        amount: shown,
        send: async (step) => {
          const request = requestFor(step, { contracts: AAVE[chainId], asset: asset.address, user, plan });
          // Estimasi juga yang pertama menangkap revert kontrak (mis. melewati batas pinjam) sebelum popup wallet.
          const gas = await gasLimitFor(client, request, user);
          return writeContractAsync({ ...request, chainId, gas } as Parameters<typeof writeContractAsync>[0]);
        },
        refreshStep,
        record: ({ hash, status, blockTimestamp }) =>
          addHistory({
            hash,
            chainId,
            kind: historyKind,
            status,
            blockTimestamp,
            asset: { symbol: asset.symbol, decimals: asset.decimals, amount: String(shown) },
          }),
        onState: setTx,
      },
      from,
    );
  }

  // "Coba lagi" melanjutkan rencana yang sama: langkah yang sudah selesai tetap tercentang.
  const run = (first: WalletStep) =>
    tx.status === 'error' && tx.steps.includes(first.step)
      ? start({ step: first, steps: tx.steps, sent: tx.sent, approved: tx.approved })
      : start({ step: first, steps: plannedSteps(first, main), sent: {} });

  // "Cek status lagi": tunggu receipt hash yang sama lagi, jangan kirim ulang.
  const recheck = () => {
    if (tx.status === 'unconfirmed') void start({ step: tx.step, steps: tx.steps, sent: tx.sent, approved: tx.approved, pending: tx.hash }, tx.amount);
  };

  return { tx, run, recheck, reset: () => setTx({ status: 'idle' }) };
}
