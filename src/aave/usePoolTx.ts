import { useState } from 'react';
import type { Address, Hash } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';

import { AAVE } from '@/config/contracts';
import type { NextStep, WalletStepName } from '@/core/nextStep';
import type { PanelTab } from '@/core/panel';
import { aaveErrorName, walletErrorKind, type WalletErrorKind } from '@/core/walletError';
import { gasLimitFor } from './gasLimit';
import { poolRequest } from './poolTx';
import { useAddLocalHistory } from './useLocalHistory';

export type WalletStep = Extract<NextStep, { step: WalletStepName }>;

/** Hash tiap langkah yang sudah terkirim, untuk tautan explorer per langkah. */
type Sent = Partial<Record<WalletStepName, Hash>>;

export type TxState =
  | { status: 'idle' }
  | { status: 'running'; steps: WalletStepName[]; index: number; phase: 'wallet' | 'confirming'; sent: Sent }
  /** `approved` = jumlah izin yang benar-benar dikirim (input panel sudah dikosongkan sesudah sukses). */
  | { status: 'success'; steps: WalletStepName[]; sent: Sent; amount: bigint; approved?: bigint }
  /**
   * `reverted` = tx masuk blok tapi gagal (gas terpakai); `aaveError` = nama custom error Aave kalau ter-decode.
   * `failed` juga dipakai kalau RPC putus waktu menunggu receipt / membaca ulang posisi.
   */
  | { status: 'error'; steps: WalletStepName[]; index: number; kind: WalletErrorKind | 'reverted'; aaveError?: string; sent: Sent };

export const isWalletStep = (step: NextStep): step is WalletStep =>
  step.step === 'resetApproval' || step.step === 'approve' || step.step === 'supply' || step.step === 'borrow' || step.step === 'repay';

// Langkah yang akan diminta wallet, diturunkan dari langkah sekarang (bukan diingat UI).
export function plannedSteps(step: WalletStep, main: PanelTab): WalletStepName[] {
  if (step.step === 'resetApproval') return ['resetApproval', 'approve', main];
  if (step.step === 'approve') return ['approve', main];
  return [main];
}

type PoolTxArgs = {
  chainId: number;
  user: Address | undefined;
  /** Transaksi utama tab aksi (yang dicatat di riwayat). */
  main: PanelTab;
  asset: { address: Address; symbol: string; decimals: number };
  /** Argumen `amount` transaksi utama (repay lunas penuh = `type(uint256).max`). */
  send: bigint;
  /** Jumlah yang ditampilkan & dicatat di riwayat (repay lunas penuh = utang saat dibaca). */
  amount: bigint;
  /** Baca ulang posisi + izin, lalu hitung nextStep dari data baru itu. Harus melempar kalau pembacaan gagal. */
  refreshStep: () => Promise<NextStep>;
};

// Satu klik menjalankan semua langkah yang tersisa (reset → approve → aksi). Tiap langkah selesai, state dibaca
// ulang dan nextStep dihitung lagi dari on-chain, jadi approve yang ternyata sudah cukup nggak diminta dua kali.
export function usePoolTx({ chainId, user, main, asset, send, amount, refreshStep }: PoolTxArgs) {
  const [tx, setTx] = useState<TxState>({ status: 'idle' });
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId });
  const addHistory = useAddLocalHistory(chainId, user);

  async function run(first: WalletStep) {
    if (!user || !client) return;
    // "Coba lagi" melanjutkan rencana yang sama: langkah yang sudah selesai tetap tercentang.
    const steps = tx.status === 'error' && tx.steps.includes(first.step) ? tx.steps : plannedSteps(first, main);
    const sent: Sent = tx.status === 'error' ? { ...tx.sent } : {};
    let step: NextStep = first;
    let approved: bigint | undefined;
    while (isWalletStep(step)) {
      const index = steps.indexOf(step.step);
      setTx({ status: 'running', steps, index, phase: 'wallet', sent: { ...sent } });
      let hash: Hash;
      try {
        const request = poolRequest(step, { pool: AAVE[chainId].pool, asset: asset.address, amount: send, user });
        // Estimasi juga yang pertama menangkap revert kontrak (mis. melewati batas pinjam) sebelum popup wallet.
        const gas = await gasLimitFor(client, request, user);
        hash = await writeContractAsync({ ...request, chainId, gas } as Parameters<typeof writeContractAsync>[0]);
      } catch (error) {
        setTx({ status: 'error', steps, index, kind: walletErrorKind(error), aaveError: aaveErrorName(error), sent: { ...sent } });
        return;
      }
      sent[step.step] = hash;
      if (step.step === 'approve') approved = step.amount;
      setTx({ status: 'running', steps, index, phase: 'confirming', sent: { ...sent } });
      try {
        const receipt = await client.waitForTransactionReceipt({ hash });
        const ok = receipt.status === 'success';
        const done = step.step === main;
        if (done) {
          const block = await client.getBlock({ blockNumber: receipt.blockNumber });
          addHistory({
            hash,
            chainId,
            kind: main,
            status: ok ? 'confirmed' : 'failed',
            blockTimestamp: Number(block.timestamp),
            asset: { symbol: asset.symbol, decimals: asset.decimals, amount: String(amount) },
          });
        }
        // Dibaca ulang juga sesudah revert, biar saldo/izin di panel nggak basi.
        step = await refreshStep();
        if (!ok) {
          setTx({ status: 'error', steps, index, kind: 'reverted', sent: { ...sent } });
          return;
        }
        if (done) {
          setTx({ status: 'success', steps, sent: { ...sent }, amount, approved });
          return;
        }
      } catch {
        // RPC putus / timeout waktu menunggu receipt atau membaca ulang: jangan tinggalkan panel di "Sedang diproses".
        setTx({ status: 'error', steps, index, kind: 'failed', sent: { ...sent } });
        return;
      }
    }
    // Sesudah approve, nextStep berhenti di langkah non-wallet (mis. saldo berubah dari luar): panel kembali normal.
    setTx({ status: 'idle' });
  }

  return { tx, run, reset: () => setTx({ status: 'idle' }) };
}
