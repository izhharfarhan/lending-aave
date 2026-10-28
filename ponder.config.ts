import { createConfig } from 'ponder';

import { ATokenAbi } from './abis/ATokenAbi';
import { PoolAbi } from './abis/PoolAbi';
import { forkStartBlock, INDEXED_CHAINS, type IndexedChainId } from './src/chains';

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
const startBlock = (chainId: IndexedChainId) => (mode === 'fork' ? forkStartBlock(chainId) : Number(requiredEnv(`START_BLOCK_${chainId}`)));

const chain = (chainId: IndexedChainId) => ({
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

// Satu entri per chain di INDEXED_CHAINS, dikunci dengan nama chain-nya.
const perChain = <T>(build: (chainId: IndexedChainId) => T) =>
  Object.fromEntries(Object.entries(INDEXED_CHAINS).map(([id, { name }]) => [name, build(Number(id) as IndexedChainId)])) as Record<
    (typeof INDEXED_CHAINS)[IndexedChainId]['name'],
    T
  >;

export default createConfig({
  database: { kind: 'postgres', connectionString: requiredEnv('DATABASE_URL') },
  chains: perChain(chain),
  contracts: {
    Pool: {
      abi: PoolAbi,
      chain: perChain((chainId) => ({ address: INDEXED_CHAINS[chainId].pool, startBlock: startBlock(chainId) })),
    },
    // Cuma `Transfer` yang tujuannya gateway (V2).
    AWeth: {
      abi: ATokenAbi,
      chain: perChain((chainId) => ({
        address: INDEXED_CHAINS[chainId].aWeth,
        startBlock: startBlock(chainId),
        filter: { event: 'Transfer' as const, args: { to: INDEXED_CHAINS[chainId].wethGateway } },
      })),
    },
  },
});
