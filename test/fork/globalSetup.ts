import { spawn, type ChildProcess } from 'node:child_process';

import { TEST_ACCOUNTS } from '../../src/config/fork';
import { forkClients, type ForkClients, type ForkTestChainId } from './clients';

type AnvilMetadata = { forkedNetwork: { forkBlockNumber: number } | null };

declare global {
  var forkTestAnvils: ChildProcess[] | undefined;
}

const metadata = ({ testClient }: ForkClients) =>
  testClient.request<{ Method: 'anvil_metadata'; Parameters: undefined; ReturnType: AnvilMetadata }>({ method: 'anvil_metadata' });

// Suite menyalakan Anvil sendiri di blok pin, bukan numpang Anvil `anvil:up` yang dipakai browser (pola swap-web).
// Cache RPC Foundry (~/.foundry/cache) tetap kepake bareng, jadi start-nya nggak dingin dari nol. Satu Anvil per chain,
// cuma chain yang punya spec di run ini: tiap project di jest.fork.config.ts punya `globalSetup.<chainId>.ts`.
export function forkGlobalSetup(chainId: ForkTestChainId) {
  return async function globalSetup() {
    globalThis.forkTestAnvils ??= [];
    globalThis.forkTestAnvils.push(await startAnvil(chainId, forkClients(chainId)));
  };
}

export async function startAnvil(chainId: ForkTestChainId, clients: ForkClients): Promise<ChildProcess> {
  const { port, rpcUrl, pinnedBlock, testClient } = clients;
  if (await metadata(clients).catch(() => null)) {
    throw new Error(`Port ${port} sudah dipakai (sisa run yang di-kill?). Matikan dulu prosesnya.`);
  }
  const envName = `ANVIL_FORK_URL_${chainId}`;
  if (!process.env[envName]) process.loadEnvFile('.env.fork');
  const forkUrl = process.env[envName];
  if (!forkUrl) throw new Error(`${envName} kosong; isi di .env.fork`);

  let stderr = '';
  const anvil = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--fork-block-number', String(pinnedBlock), '--chain-id', String(chainId), '--port', String(port)],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  anvil.stderr?.on('data', (chunk) => (stderr += chunk));
  // Kalau Jest di-Ctrl+C, globalTeardown nggak jalan; Anvil-nya jangan ditinggal hidup.
  process.once('exit', () => anvil.kill('SIGTERM'));

  const exited = new Promise<never>((_, reject) => {
    anvil.once('error', (err) => reject(new Error(`Gagal jalankan anvil (sudah foundryup?): ${err.message}`)));
    anvil.once('exit', (code) => reject(new Error(`Anvil test chain ${chainId} berhenti (kode ${code}): ${stderr.trim()}`)));
  });
  const meta = await Promise.race([waitForAnvil(clients, rpcUrl), exited]);
  const forkBlock = meta.forkedNetwork ? BigInt(meta.forkedNetwork.forkBlockNumber) : null;
  if (forkBlock !== pinnedBlock) throw new Error(`Anvil test chain ${chainId} di-fork di blok ${forkBlock}, bukan pin ${pinnedBlock}.`);

  // Akun dev Anvil punya delegasi EIP-7702 di mainnet (V7, juga di L2); hapus untuk SEMUA akun tes, sama seperti `anvil:up`.
  for (const account of Object.values(TEST_ACCOUNTS)) await testClient.setCode({ address: account, bytecode: '0x' });
  return anvil;
}

async function waitForAnvil(clients: ForkClients, rpcUrl: string): Promise<AnvilMetadata> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const meta = await metadata(clients).catch(() => null);
    if (meta) return meta;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Anvil test di ${rpcUrl} nggak menjawab dalam 30 detik`);
}
