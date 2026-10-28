import type pg from 'pg';
import { parseEther, type Address, type Hex } from 'viem';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { aave } from './aave';
import { connectTestDb, graphql, OTHER_ACCOUNT, TEST_ACCOUNT, waitForRows } from './harness';

// Tiket 19: Supply USDC di Anvil test Ethereum (globalSetup), lalu polling DB sampai row muncul. Anvil tanpa revert:
// tiap test mengirim tx-nya sendiri dan mencari row lewat hash-nya.
const usdc = (n: number) => BigInt(n) * 1_000_000n;

const ethereum = aave(1);
const { publicClient, supplyUsdc } = ethereum;
let db: pg.Client;

beforeAll(async () => {
  db = await connectTestDb(inject('testDbUrl'));
});

afterAll(async () => {
  await db?.end();
});

describe('position_event: Supply (fork Ethereum)', () => {
  it('stores one supply row with the owner from onBehalfOf and the raw amount', async () => {
    const receipt = await supplyUsdc(usdc(1_000), TEST_ACCOUNT);
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    const [row] = await waitForRows(db, receipt.transactionHash);

    // Ponder menyimpan alamat dalam huruf kecil.
    expect(row).toMatchObject({
      chain_id: 1,
      kind: 'supply',
      owner: TEST_ACCOUNT.toLowerCase(),
      caller: TEST_ACCOUNT.toLowerCase(),
      tx_from: TEST_ACCOUNT.toLowerCase(),
      reserve: ethereum.usdc.toLowerCase(),
      amount: usdc(1_000).toString(),
      timestamp: block.timestamp.toString(),
      block_number: block.number.toString(),
    });
  });

  // #11: pemilik dari field event, bukan pengirim tx.
  it('records a supply on behalf of another account under that account, not under tx.from', async () => {
    const receipt = await supplyUsdc(usdc(500), OTHER_ACCOUNT);

    const [row] = await waitForRows(db, receipt.transactionHash);

    expect(row).toMatchObject({ owner: OTHER_ACCOUNT.toLowerCase(), caller: TEST_ACCOUNT.toLowerCase(), tx_from: TEST_ACCOUNT.toLowerCase() });
  });

  // Supply ETH lewat WrappedTokenGateway: `Supply.user` = gateway, pemilik tetap user (#11, V2).
  it('records a supply of ETH through the gateway under the user, with the gateway as caller', async () => {
    const receipt = await ethereum.depositEth(parseEther('1'));

    const [row] = await waitForRows(db, receipt.transactionHash);

    expect(row).toMatchObject({
      owner: TEST_ACCOUNT.toLowerCase(),
      caller: ethereum.gateway.toLowerCase(),
      tx_from: TEST_ACCOUNT.toLowerCase(),
      reserve: ethereum.weth.toLowerCase(),
      amount: parseEther('1').toString(),
    });
  });

  it('serves the rows per owner over /graphql', async () => {
    const receipt = await supplyUsdc(usdc(250), OTHER_ACCOUNT);
    await waitForRows(db, receipt.transactionHash);

    const body = await graphql<{ positionEvents: { items: { txHash: Hex; kind: string; owner: Address; amount: string }[] } }>(
      `query ($owner: String!) { positionEvents(where: { owner: $owner }, orderBy: "timestamp", orderDirection: "desc") { items { txHash kind owner amount } } }`,
      { owner: OTHER_ACCOUNT.toLowerCase() },
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.positionEvents.items[0]).toEqual({ txHash: receipt.transactionHash, kind: 'supply', owner: OTHER_ACCOUNT.toLowerCase(), amount: usdc(250).toString() });
    expect(body.data.positionEvents.items.every((item) => item.owner === OTHER_ACCOUNT.toLowerCase())).toBe(true);
  });
});
