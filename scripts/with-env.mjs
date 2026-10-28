// Pemakaian: node scripts/with-env.mjs .env.fork ponder dev
// File env dimuat di sini dulu, baru perintahnya dijalankan dengan env itu (pola lending-web/swap-indexer). Variabel
// yang sudah ada di environment menang atas isi file. Output-nya disaring: URL RPC ber-key diganti nama variabelnya.
import { spawn } from 'node:child_process';

import { createRedactor, pipeRedacted } from './redact.mjs';

const [envFile, command, ...args] = process.argv.slice(2);
if (!envFile || !command) throw new Error('Pemakaian: with-env.mjs <file-env> <perintah> [arg...]');

process.loadEnvFile(envFile);

// Output lewat pipe, bukan terminal langsung: warna dan lebar UI Ponder dipertahankan lewat env.
const tty = process.stdout.isTTY;
const env = { ...process.env, ...(tty ? { FORCE_COLOR: '1', COLUMNS: String(process.stdout.columns) } : {}) };
const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'], env });
const redact = createRedactor();
pipeRedacted(child.stdout, process.stdout, redact);
pipeRedacted(child.stderr, process.stderr, redact);
// 'close' (bukan 'exit'): tunggu sisa output tersaring terkirim dulu.
child.on('close', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 1)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
