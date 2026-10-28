// Nyalain Anvil fork per chain, selalu di blok pin (pola swap-web Q4/Q5).
// Sengaja nggak ada opsi fork dari latest: blok cuma dibaca dari forkChains.json.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const forkChains = readJson('../src/config/forkChains.json');
// Semua akun tes yang dipakai app & Dev Tools (user + likuidator). Private key-nya publik, jadi di mainnet
// udah dipasangin delegasi EIP-7702 (DECISIONS.md V7); lihat clearTestAccountCode.
const TEST_ACCOUNTS = Object.values(readJson('../src/config/testAccounts.json'));

// Multicall3, alamatnya sama di semua chain.
const PROBE_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

// Kode delegasi bikin akun tes bukan EOA lagi (tx bisa lewat kode orang lain). Di fork aja kodenya dihapus,
// untuk SEMUA akun tes, termasuk likuidator Dev Tools (swap-web cuma akun #0). Hasilnya dicek ulang lewat
// `eth_getCode`; kalau tetap gagal, fork dianggap setengah jadi dan dimatikan (lihat bawah).
async function clearTestAccountCode(chainId, port) {
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      for (const account of TEST_ACCOUNTS) await rpc(url, 'anvil_setCode', [account, '0x']);
      const codes = await Promise.all(TEST_ACCOUNTS.map((account) => rpc(url, 'eth_getCode', [account, 'latest'])));
      if (codes.every((code) => code === '0x')) {
        console.log(`[chain ${chainId}] kode delegasi ${TEST_ACCOUNTS.length} akun tes dihapus`);
        return true;
      }
    } catch {
      // Anvil belum siap menerima request; coba lagi.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[chain ${chainId}] gagal hapus kode delegasi akun tes dalam 30 detik`);
  return false;
}

// RPC non-archive cuma nyimpen state ~128 blok terakhir; begitu pin ketinggalan, tiap baca kontrak gagal
// (DECISIONS.md V7). Ditolak di depan, bukan ketahuan belakangan di browser.
async function assertServesPinnedState(chainId, forkUrl, forkBlock) {
  let code;
  let reason = 'jawaban kosong';
  try {
    code = await rpc(forkUrl, 'eth_getCode', [PROBE_ADDRESS, `0x${forkBlock.toString(16)}`]);
  } catch (err) {
    reason = err.message;
  }
  if (!code || code === '0x') {
    throw new Error(`ANVIL_FORK_URL_${chainId} nggak bisa ngasih state di blok ${forkBlock} (${reason}). Pakai RPC archive.`);
  }
}

const entries = Object.entries(forkChains);
const forkUrlOf = (chainId) => process.env[`ANVIL_FORK_URL_${chainId}`];
// Semua pemeriksaan di depan, sebelum satu Anvil pun dinyalakan: gagal = satu baris pesan + exit 1, bukan stack
// trace dan bukan fork setengah jadi.
try {
  for (const [chainId, { forkBlock }] of entries) {
    const forkUrl = forkUrlOf(chainId);
    if (!forkUrl) throw new Error(`ANVIL_FORK_URL_${chainId} kosong; isi di .env.fork`);
    if (!Number.isInteger(forkBlock)) throw new Error(`Blok pin chain ${chainId} nggak valid di forkChains.json`);
    await assertServesPinnedState(chainId, forkUrl, forkBlock);
  }
} catch (err) {
  console.error(`[anvil-up] ${err.message}`);
  process.exit(1);
}

const children = entries.map(([chainId, { forkBlock, port }]) => {
  const forkUrl = forkUrlOf(chainId);
  console.log(`[chain ${chainId}] fork blok ${forkBlock} → http://127.0.0.1:${port}`);
  // Chain ID asli (bukan 31337) biar alamat & signature sama dengan mainnet.
  const child = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--fork-block-number', String(forkBlock), '--chain-id', chainId, '--port', String(port)],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  child.on('error', (err) => {
    console.error(`[chain ${chainId}] gagal jalanin anvil (udah foundryup?):`, err.message);
    process.exitCode = 1;
  });
  return child;
});

// Berhenti: SIGTERM dulu (Anvil nutup rapi); lewat 5 detik (atau Ctrl+C kedua) → SIGKILL. SIGCONT dulu: sinyal
// ke proses yang lagi stopped cuma ngantre sampai dia jalan lagi.
const KILL_AFTER_MS = 5_000;
const running = (child) => child.exitCode === null && child.signalCode === null;
const signalAll = (signal) => children.filter(running).forEach((child) => child.kill(signal));
let stopping = false;
function stopAll(reason) {
  if (stopping) {
    console.error('[anvil-up] dipaksa: SIGKILL');
    signalAll('SIGKILL');
    return;
  }
  stopping = true;
  console.log(`[anvil-up] ${reason}, matiin Anvil…`);
  signalAll('SIGCONT');
  signalAll('SIGTERM');
  setTimeout(() => {
    console.error(`[anvil-up] Anvil belum mati ${KILL_AFTER_MS / 1000} detik sesudah SIGTERM: SIGKILL`);
    signalAll('SIGKILL');
  }, KILL_AFTER_MS);
}
// SIGHUP = terminal ditutup.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => stopAll(signal));

// Ctrl+C bisa bikin pnpm keluar duluan; script ini lalu diadopsi init. Parent ganti = anggap disuruh berhenti.
const parentPid = process.ppid;
const parentWatch = setInterval(() => {
  if (process.ppid === parentPid) return;
  clearInterval(parentWatch);
  stopAll('parent (pnpm) udah keluar');
}, 1_000);
parentWatch.unref();

// Fork baru dinyatakan siap kalau akun tes di SEMUA chain sudah bersih. Gagal = fork setengah jadi: matikan semua
// Anvil dan keluar dengan kode 1, jangan dibiarkan jalan dengan akun yang masih terdelegasi.
const cleared = await Promise.all(entries.map(([chainId, { port }]) => clearTestAccountCode(chainId, port)));
if (cleared.every(Boolean)) {
  // lending-indexer mulai index di blok pin + 1 (DECISIONS Q31); di fork yang baru nyala blok itu belum ada, dan Ponder
  // berhenti dengan error kalau start block-nya nggak ketemu. Satu blok kosong ditambang supaya indexer bisa langsung jalan.
  await Promise.all(entries.map(([, { port }]) => rpc(`http://127.0.0.1:${port}`, 'evm_mine', [])));
  console.log('[anvil-up] siap: semua fork jalan dan akun tes bersih');
} else {
  process.exitCode = 1;
  stopAll('akun tes belum bersih');
}

// Keluar begitu semua Anvil mati.
let alive = children.length;
children.forEach((child) =>
  child.on('close', () => {
    if (--alive === 0) process.exit();
  }),
);
