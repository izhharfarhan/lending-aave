import { WaitForTransactionReceiptTimeoutError, type Hash, type PublicClient, type TransactionReceipt } from 'viem';

import type { NextStep, WalletStepName } from '@/core/nextStep';
import type { LocalTxEntry } from '@/core/localHistory';
import { aaveErrorName, walletErrorKind, type WalletErrorKind } from '@/core/walletError';
import { isWalletStep } from '@/core/nextStep';
import type { WalletStep } from './poolTx';

/** Hash tiap langkah yang sudah terkirim, untuk tautan explorer per langkah. */
export type Sent = Partial<Record<WalletStepName, Hash>>;

/**
 * Jumlah yang dipakai judul langkah di panel, disimpan saat dikirim: sesudah tx masuk posisi dibaca ulang dan panel
 * menghitung ulang jumlahnya (mis. "Repay 0 USDC" sesudah lunas), jadi judul nggak boleh ikut berubah.
 * `amount` = jumlah transaksi utama, `approved` = izin yang diminta/dikirim (approve atau delegasi).
 */
type Sending = { steps: WalletStepName[]; sent: Sent; amount: bigint; approved?: bigint };

export type TxState =
  | { status: 'idle' }
  | (Sending & { status: 'running'; index: number; phase: 'wallet' | 'confirming' })
  /** `kind` = jenis transaksinya (toggle jaminan berbalik sesudah posisi dibaca ulang). */
  | (Sending & { status: 'success'; kind: LocalTxEntry['kind'] })
  /**
   * Tx langkah ini sudah disiarkan wallet, tapi receipt-nya belum didapat sampai batas waktu (RPC sibuk/terputus, atau
   * tx masih antre). Hasilnya belum pasti: jangan ditawari kirim ulang, cuma cek status `hash` lagi.
   */
  | (Sending & { status: 'unconfirmed'; index: number; step: WalletStep; hash: Hash })
  /**
   * Kesalahan sebelum tx disiarkan (`WalletErrorKind`, termasuk `failed` = estimasi/RPC/wallet gagal sebelum kirim),
   * `reverted` = tx masuk blok tapi gagal (gas terpakai; `aaveError` = nama custom error Aave kalau ter-decode), atau
   * `readFailed` = langkah sebelum langkah utama (approve) sudah masuk tapi posisi gagal dibaca ulang.
   */
  | (Sending & { status: 'error'; index: number; kind: WalletErrorKind | 'reverted' | 'readFailed'; aaveError?: string });

export type ReceiptWait = {
  /** Batas total menunggu receipt satu tx sebelum dianggap belum pasti (default viem juga 3 menit). */
  timeoutMs: number;
  /** Jeda sebelum mencoba lagi sesudah RPC error. */
  retryDelayMs: number;
};

const DEFAULT_RECEIPT_WAIT: ReceiptWait = { timeoutMs: 180_000, retryDelayMs: 2_000 };
// Pembacaan sesudah receipt (blok untuk riwayat, posisi baru): dicoba beberapa kali dulu sebelum menyerah.
const READ_ATTEMPTS = 3;

export type WalletStepsDeps = {
  client: PublicClient;
  /** Langkah utama tab ini; sampai di sini rangkaian selesai. */
  main: WalletStepName;
  kind: LocalTxEntry['kind'];
  /** Jumlah yang dikirim/dicatat (`plan.shown`). */
  amount: bigint;
  /** Estimasi gas + popup wallet; resolve dengan hash begitu wallet menyiarkan tx. */
  send: (step: WalletStep) => Promise<Hash>;
  /** Baca ulang posisi + izin, lalu hitung nextStep dari data baru itu. Harus melempar kalau pembacaan gagal. */
  refreshStep: () => Promise<NextStep>;
  /** Langkah utama sudah punya receipt: catat ke riwayat lokal. */
  record: (entry: { hash: Hash; status: LocalTxEntry['status']; blockTimestamp: number }) => void;
  onState: (state: TxState) => void;
  receiptWait?: ReceiptWait;
};

export type WalletStepsStart = {
  step: WalletStep;
  /** Rencana langkah; "Coba lagi"/"Cek status lagi" melanjutkan rencana yang sama (yang selesai tetap tercentang). */
  steps: WalletStepName[];
  sent: Sent;
  approved?: bigint;
  /** Hash `step` yang sudah disiarkan tapi belum ada receipt-nya: ditunggu lagi, bukan dikirim ulang. */
  pending?: Hash;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Satu klik menjalankan semua langkah yang tersisa (reset → approve → aksi). Tiap langkah selesai, state dibaca
// ulang dan nextStep dihitung lagi dari on-chain, jadi approve yang ternyata sudah cukup nggak diminta dua kali.
//
// Begitu wallet mengembalikan hash, tx sudah disiarkan: kegagalan RPC sesudah itu (429 kuota, node load balancer yang
// belum kenal tx/bloknya) bukan "tidak terkirim". Receipt ditunggu terus sampai `timeoutMs`; yang tetap nggak pasti
// jadi `unconfirmed`. Pesan gagal cuma untuk penolakan/kegagalan sebelum kirim dan revert (smoke test Base, tiket 25).
export async function runWalletSteps(deps: WalletStepsDeps, start: WalletStepsStart): Promise<void> {
  const { client, main, onState } = deps;
  const wait = deps.receiptWait ?? DEFAULT_RECEIPT_WAIT;
  const { steps } = start;
  const sent = { ...start.sent };
  let approved = start.approved;
  let pending = start.pending;
  let step: NextStep = start.step;
  const sending = (): Sending => ({ steps, sent: { ...sent }, amount: deps.amount, approved });
  while (isWalletStep(step)) {
    const current = step;
    const index = steps.indexOf(current.step);
    if (current.step === 'approve' || current.step === 'delegate') approved = current.amount;
    let hash = pending;
    pending = undefined;
    if (!hash) {
      onState({ ...sending(), status: 'running', index, phase: 'wallet' });
      try {
        hash = await deps.send(current);
      } catch (error) {
        onState({ ...sending(), status: 'error', index, kind: walletErrorKind(error), aaveError: aaveErrorName(error) });
        return;
      }
      sent[current.step] = hash;
    }
    onState({ ...sending(), status: 'running', index, phase: 'confirming' });
    const receipt = await waitForReceipt(client, hash, wait);
    if (!receipt) {
      onState({ ...sending(), status: 'unconfirmed', index, step: current, hash });
      return;
    }
    const ok = receipt.status === 'success';
    const done = current.step === main;
    if (done) {
      deps.record({ hash, status: ok ? 'confirmed' : 'failed', blockTimestamp: await blockTimestamp(client, receipt, wait) });
    }
    // Dibaca ulang juga sesudah revert/sukses, biar saldo/izin di panel nggak basi. Kalau gagal, polling posisi biasa
    // yang menyusul; hasil tx-nya sudah pasti dari receipt.
    const next = await attempt(deps.refreshStep, wait.retryDelayMs);
    if (!ok) {
      onState({ ...sending(), status: 'error', index, kind: 'reverted' });
      return;
    }
    if (done) {
      onState({ ...sending(), status: 'success', kind: deps.kind });
      return;
    }
    if (next === undefined) {
      onState({ ...sending(), status: 'error', index: index + 1, kind: 'readFailed' });
      return;
    }
    step = next;
  }
  // Sesudah approve, nextStep berhenti di langkah non-wallet (mis. saldo berubah dari luar): panel kembali normal.
  onState({ status: 'idle' });
}

// `waitForTransactionReceipt` viem sendiri cuma sabar terhadap "tx/receipt belum ada"; error RPC lain (mis. 429)
// langsung me-reject. Di sini error seperti itu ditunggu ulang sampai batas waktu. `null` = belum pasti.
async function waitForReceipt(client: PublicClient, hash: Hash, wait: ReceiptWait): Promise<TransactionReceipt | null> {
  const deadline = Date.now() + wait.timeoutMs;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return null;
    try {
      return await client.waitForTransactionReceipt({ hash, timeout: left });
    } catch (error) {
      if (error instanceof WaitForTransactionReceiptTimeoutError) return null;
      await sleep(Math.min(wait.retryDelayMs, Math.max(deadline - Date.now(), 0)));
    }
  }
}

async function attempt<T>(read: () => Promise<T>, retryDelayMs: number): Promise<T | undefined> {
  for (let i = 1; ; i++) {
    try {
      return await read();
    } catch {
      if (i >= READ_ATTEMPTS) return undefined;
      await sleep(retryDelayMs);
    }
  }
}

// Waktu blok untuk riwayat (Q30: waktu chain, bukan jam lokal). Kalau bloknya tetap gagal dibaca, jam lokal dipakai:
// lebih baik riwayatnya tercatat dengan waktu kira-kira daripada hilang.
async function blockTimestamp(client: PublicClient, receipt: TransactionReceipt, wait: ReceiptWait): Promise<number> {
  const block = await attempt(() => client.getBlock({ blockNumber: receipt.blockNumber }), wait.retryDelayMs);
  return block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
}
