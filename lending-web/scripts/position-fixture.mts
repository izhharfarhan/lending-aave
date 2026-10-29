// Pemakaian: pnpm fixture:position (butuh `pnpm anvil:up` jalan)
// Nulis ulang fixture modul domain (DECISIONS.md Q25 seam 1): hasil `readChain` app ini untuk posisi NYATA di
// Ethereum mainnet, dibaca di blok pin. Baca di blok pin (bukan latest) bikin hasilnya sama walau state Anvil
// sudah diubah transaksi dari browser.
import { writeFileSync } from 'node:fs';
import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';

import { readChain } from '@/aave/readChain';
import { WHITELIST } from '@/config/assets';
import { AAVE } from '@/config/contracts';
import { forkBlock, forkRpcUrl } from '@/config/fork';
import type { ChainRead } from '@/core/chainPosition';
import { stringifyBigint } from '@/core/fixtures/bigintJson';

const OUT = 'src/core/fixtures/ethereum.position.json';
const CHAIN_ID = 1;

// Akun mainnet yang dipilih dari event Borrow di sekitar blok pin, satu per bentuk posisi yang dites.
const USERS = {
  /** Jaminan ETH, utang USDC, HF ~5,5 (Aman). Semua aset whitelist. */
  ethCollateralUsdcDebt: '0x898Ae2fA55497587BEcb740a7f4E18220dDbf9A9',
  /** Jaminan ETH, utang USDC, HF ~1,88 (Waspada). */
  waspada: '0x7Cdc43434a6402040EA8770c2458BB57F646a86d',
  /** Jaminan ETH + tBTC, utang USDC + GHO, HF ~1,30 (Bahaya). tBTC dan GHO = aset luar. */
  bahayaWithOutsideAssets: '0xd28E7c36381c17fDe2635529526B0F6303B30F75',
  /** Jaminan ETH + USDT, LINK di-supply tapi bukan jaminan, utang ETH, HF ~1,07. */
  ethDebtOutsideNonCollateral: '0xEbaEA2Eb91d2c2A10E3D7dA528bae36312d627f0',
  /** Supply USDC saja, tanpa utang. */
  noDebt: '0x5b3a59D923cFF08E3d53F80d5eA2B9E94a0B3b86',
  /** Pernah berposisi, sekarang kosong. */
  empty: '0x5aAE4d2f360e156De3416936049837A7Bb685588',
} satisfies Record<string, Address>;

// Fork dingin: storage diambil satu-satu dari RPC archive, getReservesData bisa makan beberapa menit.
const client = createPublicClient({ chain: mainnet, transport: http(forkRpcUrl(CHAIN_ID), { timeout: 600_000 }) });
const args = { contracts: AAVE[CHAIN_ID], whitelist: WHITELIST[CHAIN_ID], blockNumber: forkBlock(CHAIN_ID) };

const guest = await readChain(client, { ...args, user: undefined });
const users: Record<string, NonNullable<ChainRead['user']> & { address: Address }> = {};
for (const [label, address] of Object.entries(USERS)) {
  const read = await readChain(client, { ...args, user: address });
  users[label] = { address, ...read.user! };
  console.log(`${label}: ${address}`);
}

const { user: _none, ...chain } = guest;
writeFileSync(OUT, `${stringifyBigint({ chainId: CHAIN_ID, blockNumber: args.blockNumber, ...chain, users })}\n`);
console.log(`→ ${OUT}`);
