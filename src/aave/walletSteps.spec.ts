import { createPublicClient, custom, type Hash, type PublicClient } from 'viem';
import { base } from 'viem/chains';

import type { NextStep } from '@/core/nextStep';
import type { WalletStep } from './poolTx';
import { runWalletSteps, type TxState, type WalletStepsDeps } from './walletSteps';

// Smoke test Base mainnet (tiket 25): borrow/repay/withdraw sukses on-chain, tapi panel menulis "Transaksi tidak
// terkirim" karena RPC sempat error (429 kuota Alchemy) waktu receipt ditunggu. RPC palsu di bawah meniru itu: tx
// ditambang `minedAfterMs` sesudah dikirim, dan metode di `failing` melempar 429 sebanyak `times` panggilan pertama.
const HASH = `0x${'ab'.repeat(32)}` as Hash;
const ZERO32 = `0x${'00'.repeat(32)}`;
const USER = `0x${'22'.repeat(20)}`;

type FakeRpc = {
  minedAfterMs?: number;
  reverted?: boolean;
  failing?: Partial<Record<string, number>>;
};

function fakeClient({ minedAfterMs = 300, reverted = false, failing = {} }: FakeRpc): PublicClient {
  const t0 = Date.now();
  const left = { ...failing };
  const blockAt = () => 100n + BigInt(Math.floor((Date.now() - t0) / 100));
  const mined = () => Date.now() - t0 >= minedAfterMs;
  const hex = (n: bigint) => `0x${n.toString(16)}`;
  const block = (number: bigint) => ({
    number: hex(number), hash: ZERO32, parentHash: ZERO32, timestamp: hex(1_800_000_000n + number), transactions: [],
    gasLimit: '0x1', gasUsed: '0x1', baseFeePerGas: '0x1', miner: USER, extraData: '0x', logsBloom: `0x${'00'.repeat(256)}`,
    difficulty: '0x0', nonce: '0x0000000000000000', size: '0x1', stateRoot: ZERO32, receiptsRoot: ZERO32,
    transactionsRoot: ZERO32, sha3Uncles: ZERO32, mixHash: ZERO32, uncles: [],
  });
  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown[] }) {
      if (left[method]) {
        left[method]! -= 1;
        throw Object.assign(new Error('Your app has exceeded its compute units per second capacity'), { code: 429 });
      }
      switch (method) {
        case 'eth_blockNumber':
          return hex(blockAt());
        case 'eth_getBlockByNumber': {
          const tag = params?.[0];
          return block(typeof tag === 'string' && tag.startsWith('0x') ? BigInt(tag) : blockAt());
        }
        case 'eth_getTransactionByHash':
          return {
            hash: HASH, from: USER, to: USER, nonce: '0x1', value: '0x0', input: '0x', gas: '0x5208', gasPrice: '0x1',
            type: '0x0', v: '0x1b', r: '0x1', s: '0x1', chainId: '0x2105',
            blockNumber: mined() ? hex(101n) : null, blockHash: mined() ? ZERO32 : null, transactionIndex: mined() ? '0x0' : null,
          };
        case 'eth_getTransactionReceipt':
          if (!mined()) return null;
          return {
            transactionHash: HASH, blockNumber: hex(101n), blockHash: ZERO32, status: reverted ? '0x0' : '0x1', logs: [],
            from: USER, to: USER, gasUsed: '0x1', cumulativeGasUsed: '0x1', effectiveGasPrice: '0x1',
            transactionIndex: '0x0', type: '0x0', logsBloom: `0x${'00'.repeat(256)}`, contractAddress: null,
          };
      }
      throw new Error(`RPC palsu: ${method} nggak didukung`);
    },
  }, { retryCount: 0 });
  return createPublicClient({ chain: base, transport, pollingInterval: 50 }) as PublicClient;
}

const BORROW = { step: 'borrow' } as WalletStep;
const IDLE = { step: 'enterAmount' } as NextStep;

async function run(client: PublicClient, overrides: Partial<WalletStepsDeps> = {}) {
  const states: TxState[] = [];
  const recorded: Parameters<WalletStepsDeps['record']>[0][] = [];
  await runWalletSteps(
    {
      client,
      main: 'borrow',
      kind: 'borrow',
      amount: 500_000n,
      send: async () => HASH,
      refreshStep: async () => IDLE,
      record: (entry) => recorded.push(entry),
      onState: (state) => states.push(state),
      receiptWait: { timeoutMs: 5_000, retryDelayMs: 20 },
      ...overrides,
    },
    { step: BORROW, steps: ['borrow'], sent: {} },
  );
  return { final: states.at(-1)!, states, recorded };
}

describe('runWalletSteps: tx yang sudah terkirim', () => {
  it('RPC sempat menolak (429) waktu receipt ditunggu: tetap sukses begitu receipt ada', async () => {
    const { final, recorded } = await run(fakeClient({ failing: { eth_getTransactionReceipt: 3 } }));
    expect(final).toMatchObject({ status: 'success', kind: 'borrow', sent: { borrow: HASH } });
    expect(recorded).toEqual([{ hash: HASH, status: 'confirmed', blockTimestamp: 1_800_000_101 }]);
  });

  it('receipt belum ada di percobaan pertama: menunggu, lalu sukses', async () => {
    const { final } = await run(fakeClient({ minedAfterMs: 600 }));
    expect(final).toMatchObject({ status: 'success' });
  });

  it('blok tx sempat gagal dibaca untuk riwayat: tetap sukses dan tercatat', async () => {
    const { final, recorded } = await run(fakeClient({ failing: { eth_getBlockByNumber: 2 }, minedAfterMs: 0 }));
    expect(final).toMatchObject({ status: 'success' });
    expect(recorded).toEqual([{ hash: HASH, status: 'confirmed', blockTimestamp: 1_800_000_101 }]);
  });

  it('posisi gagal dibaca ulang sesudah langkah utama sukses: tetap sukses', async () => {
    const { final } = await run(fakeClient({}), { refreshStep: () => Promise.reject(new Error('429')) });
    expect(final).toMatchObject({ status: 'success' });
  });

  it('receipt nggak kunjung ada sampai batas waktu: "belum pasti" + hash, bukan "tidak terkirim"', async () => {
    const { final } = await run(fakeClient({ minedAfterMs: 60_000 }), { receiptWait: { timeoutMs: 400, retryDelayMs: 20 } });
    expect(final).toMatchObject({ status: 'unconfirmed', hash: HASH, sent: { borrow: HASH } });
  });

  it('"Cek status lagi" melanjutkan hash yang sama tanpa mengirim ulang', async () => {
    let sends = 0;
    const send = async () => (sends++, HASH);
    const states: TxState[] = [];
    await runWalletSteps(
      { client: fakeClient({ minedAfterMs: 0 }), main: 'borrow', kind: 'borrow', amount: 1n, send, refreshStep: async () => IDLE, record: () => {}, onState: (s) => states.push(s) },
      { step: BORROW, steps: ['borrow'], sent: { borrow: HASH }, pending: HASH },
    );
    expect(sends).toBe(0);
    expect(states.at(-1)).toMatchObject({ status: 'success' });
  });

  it('tx revert: "gagal di jaringan", bukan sukses', async () => {
    const { final, recorded } = await run(fakeClient({ reverted: true }));
    expect(final).toMatchObject({ status: 'error', kind: 'reverted' });
    expect(recorded).toEqual([expect.objectContaining({ status: 'failed' })]);
  });

  it('ditolak di wallet: belum ada hash', async () => {
    const { final } = await run(fakeClient({}), { send: () => Promise.reject(Object.assign(new Error('User rejected'), { code: 4001 })) });
    expect(final).toMatchObject({ status: 'error', kind: 'rejected', sent: {} });
  });
});
