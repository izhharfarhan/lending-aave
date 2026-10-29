import { spawn, type ChildProcess } from 'node:child_process';

import pg from 'pg';
import type { TestProject } from 'vitest/node';

import { INDEXED_CHAINS } from '../../src/chains';
import { anvilUrl, OTHER_ACCOUNT, PONDER_PORT, PONDER_URL, requiredEnv, SCHEMA, TEST_ACCOUNT, TEST_CHAINS, testClients, waitFor, type TestChainId } from './harness';

// Pola swap-indexer: satu Anvil per chain tanpa revert, DB sekali pakai, satu Ponder untuk semua file test integrasi.

// URL DB test dari setup ke file test (`inject('testDbUrl')`).
declare module 'vitest' {
  interface ProvidedContext {
    testDbUrl: string;
  }
}

const testChainIds = Object.keys(TEST_CHAINS).map(Number) as TestChainId[];

export default async function setup(project: TestProject) {
  for (const url of [...testChainIds.map(anvilUrl), `${PONDER_URL}/health`]) {
    if (await fetch(url).then(() => true, () => false)) throw new Error(`Proses test sudah ada di ${url} (sisa run yang di-kill?). Matikan dulu.`);
  }

  // DB sekali pakai di Postgres docker-compose: nama unik per run, di-drop di teardown.
  const adminUrl = new URL(requiredEnv('DATABASE_URL'));
  adminUrl.pathname = '/postgres';
  const testDbName = `lending_test_${Date.now()}`;
  const testDbUrl = new URL(adminUrl);
  testDbUrl.pathname = `/${testDbName}`;
  await withAdmin(adminUrl, (admin) => admin.query(`CREATE DATABASE ${testDbName}`)).catch((err: Error) => {
    throw new Error(`Postgres ${adminUrl.host} gagal (sudah \`pnpm db:up\`?): ${err.message}`);
  });

  const processes: ChildProcess[] = [];
  const teardown = async () => {
    await Promise.all(processes.map(stopProcess));
    await withAdmin(adminUrl, (admin) => admin.query(`DROP DATABASE IF EXISTS ${testDbName} WITH (FORCE)`));
  };

  try {
    await Promise.all(testChainIds.map(async (chainId) => {
      processes.push(startProcess('anvil', [
        '--fork-url', requiredEnv(`ANVIL_FORK_URL_${chainId}`),
        '--fork-block-number', String(INDEXED_CHAINS[chainId].pinBlock),
        '--chain-id', String(chainId),
        '--port', String(TEST_CHAINS[chainId].anvilPort),
        ...TEST_CHAINS[chainId].anvilArgs,
      ]));
      const { publicClient, testClient } = testClients(chainId);
      await waitFor(`Anvil test chain ${chainId}`, () => publicClient.getChainId().then(() => true));
      for (const address of [TEST_ACCOUNT, OTHER_ACCOUNT]) await testClient.setCode({ address, bytecode: '0x' });
      // Start block fork = pin + 1 (Q31): blok itu harus ada dulu sebelum Ponder mulai.
      await testClient.mine({ blocks: 1 });
    }));

    processes.push(startProcess('node_modules/.bin/ponder', ['start', '--schema', SCHEMA, '--port', String(PONDER_PORT)], {
      PONDER_MODE: 'fork',
      DATABASE_URL: testDbUrl.href,
      ...Object.fromEntries(testChainIds.map((chainId) => [`PONDER_RPC_URL_${chainId}`, anvilUrl(chainId)])),
    }));
    // `/ready` = backfill semua chain selesai, Ponder sudah mengikuti blok baru.
    await waitFor('Ponder', () => fetch(`${PONDER_URL}/ready`).then((res) => res.ok));
  } catch (err) {
    await teardown();
    throw err;
  }

  project.provide('testDbUrl', testDbUrl.href);
  return teardown;
}

async function withAdmin<T>(url: URL, run: (admin: pg.Client) => Promise<T>) {
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  try {
    return await run(admin);
  } finally {
    await admin.end();
  }
}

// Output proses (anvil membawa URL fork di argumennya) nggak pernah dicetak utuh: cuma ekor log saat gagal, dan URL
// disamarkan supaya key RPC nggak bocor ke output test.
const redact = (text: string) => text.replace(/\b[a-z]+:\/\/\S+/gi, '<url>');
const LOG_TAIL = 4000;

function startProcess(command: string, args: string[], env: Record<string, string> = {}) {
  let output = '';
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.once('error', (err) => console.error(`Gagal menjalankan ${command} (anvil: sudah foundryup?): ${redact(err.message)}`));
  // Cuma ekornya yang dipakai, jadi buffer dibatasi.
  const append = (chunk: Buffer) => (output = (output + chunk).slice(-LOG_TAIL));
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  child.once('exit', (code) => {
    if (code !== null && code !== 0) console.error(`${command} berhenti (kode ${code}):\n${redact(output)}`);
  });
  return child;
}

function stopProcess(child: ChildProcess) {
  // Sudah keluar (kode atau sinyal), atau gagal dijalankan sama sekali (ENOENT: `exit` nggak pernah datang).
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  });
}
