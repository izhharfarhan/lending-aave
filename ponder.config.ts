import { createConfig } from 'ponder';

import { PoolAbi } from './abis/PoolAbi';
import { forkStartBlock, INDEXED_CHAINS } from './src/chains';

// Mode dari env (pola swap-indexer): satu config untuk fork & mainnet, database-nya beda lewat DATABASE_URL.
const mode = process.env.PONDER_MODE;
if (mode !== 'fork' && mode !== 'mainnet') {
  throw new Error(`PONDER_MODE harus "fork" atau "mainnet" (dapat ${JSON.stringify(mode)}). Jalankan lewat pnpm dev:fork / dev:mainnet.`);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} kosong; isi di .env.${mode}`);
  return value;
}

// DECISIONS Q31: fork = blok pin + 1 (tanpa backfill); mainnet = blok terbaru saat indexer mulai (env).
const startBlock = (chainId: keyof typeof INDEXED_CHAINS) => (mode === 'fork' ? forkStartBlock(chainId) : Number(requiredEnv(`START_BLOCK_${chainId}`)));

const chain = (chainId: keyof typeof INDEXED_CHAINS) => ({
  id: chainId,
  rpc: requiredEnv(`PONDER_RPC_URL_${chainId}`),
  // Q31: batas Alchemy free (10 blok per `eth_getLogs`), terutama untuk mainnet. Di fork semua blok yang diminta sesudah
  // pin (dilayani Anvil sendiri, murah). Efek samping: dengan nilai ini Ponder nggak lagi mengecilkan range otomatis
  // saat `eth_getLogs` ditolak.
  ethGetLogsBlockRange: 10,
  // Anvil di-restart = chain baru dengan nomor blok yang sama, jadi cache RPC run sebelumnya salah (pola swap-indexer).
  cacheRpcRequests: mode !== 'fork',
  // Blok Anvil baru ber-timestamp jam sekarang, blok pin lama: dengan reorgWindow default, "finalized" jatuh di bawah
  // pin. Anvil nggak pernah reorg (restart = chain baru, `db:reset:fork`), jadi di fork latest = finalized.
  reorgWindow: mode === 'fork' ? 0 : undefined,
});

export default createConfig({
  database: { kind: 'postgres', connectionString: requiredEnv('DATABASE_URL') },
  chains: { mainnet: chain(1) },
  contracts: {
    Pool: {
      abi: PoolAbi,
      chain: { mainnet: { address: INDEXED_CHAINS[1].pool, startBlock: startBlock(1) } },
    },
  },
});
