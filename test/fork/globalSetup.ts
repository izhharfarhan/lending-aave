import { spawn, type ChildProcess } from 'node:child_process';

import { TEST_ACCOUNTS } from '../../src/config/fork';
import { FORK_RPC_URL, FORK_TEST_PORT, PINNED_FORK_BLOCK, testClient } from './clients';

type AnvilMetadata = { forkedNetwork: { forkBlockNumber: number } | null };

declare global {
  var forkTestAnvil: ChildProcess | undefined;
}

const metadata = () =>
  testClient.request<{ Method: 'anvil_metadata'; Parameters: undefined; ReturnType: AnvilMetadata }>({ method: 'anvil_metadata' });

// Suite menyalakan Anvil sendiri di blok pin, bukan numpang Anvil `anvil:up` yang dipakai browser (pola swap-web).
// Cache RPC Foundry (~/.foundry/cache) tetap kepake bareng, jadi start-nya nggak dingin dari nol.
export default async function globalSetup() {
  if (await metadata().catch(() => null)) {
    throw new Error(`Port ${FORK_TEST_PORT} sudah dipakai (sisa run yang di-kill?). Matikan dulu prosesnya.`);
  }
  if (!process.env.ANVIL_FORK_URL_1) process.loadEnvFile('.env.fork');
  const forkUrl = process.env.ANVIL_FORK_URL_1;
  if (!forkUrl) throw new Error('ANVIL_FORK_URL_1 kosong; isi di .env.fork');

  let stderr = '';
  const anvil = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--fork-block-number', String(PINNED_FORK_BLOCK), '--chain-id', '1', '--port', String(FORK_TEST_PORT)],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  anvil.stderr?.on('data', (chunk) => (stderr += chunk));
  // Kalau Jest di-Ctrl+C, globalTeardown nggak jalan; Anvil-nya jangan ditinggal hidup.
  process.once('exit', () => anvil.kill('SIGTERM'));
  globalThis.forkTestAnvil = anvil;

  const exited = new Promise<never>((_, reject) => {
    anvil.once('error', (err) => reject(new Error(`Gagal jalankan anvil (sudah foundryup?): ${err.message}`)));
    anvil.once('exit', (code) => reject(new Error(`Anvil test berhenti (kode ${code}): ${stderr.trim()}`)));
  });
  const meta = await Promise.race([waitForAnvil(), exited]);
  const forkBlock = meta.forkedNetwork ? BigInt(meta.forkedNetwork.forkBlockNumber) : null;
  if (forkBlock !== PINNED_FORK_BLOCK) throw new Error(`Anvil test di-fork di blok ${forkBlock}, bukan pin ${PINNED_FORK_BLOCK}.`);

  // Akun dev Anvil punya delegasi EIP-7702 di mainnet (V7); hapus untuk SEMUA akun tes, sama seperti `anvil:up`.
  for (const account of Object.values(TEST_ACCOUNTS)) await testClient.setCode({ address: account, bytecode: '0x' });
}

async function waitForAnvil(): Promise<AnvilMetadata> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const meta = await metadata().catch(() => null);
    if (meta) return meta;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Anvil test di ${FORK_RPC_URL} nggak menjawab dalam 30 detik`);
}
