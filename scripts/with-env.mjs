// Pemakaian: node scripts/with-env.mjs .env.fork next dev
// Next nolak `node --env-file` (flag-nya kebawa ke NODE_OPTIONS child process),
// jadi file env dimuat di sini dulu, baru perintahnya dijalanin dengan env itu.
import { spawn } from 'node:child_process';

const [envFile, command, ...args] = process.argv.slice(2);
if (!envFile || !command) throw new Error('Pemakaian: with-env.mjs <file-env> <perintah> [arg...]');

process.loadEnvFile(envFile);

const child = spawn(command, args, { stdio: 'inherit' });
child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 1)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
