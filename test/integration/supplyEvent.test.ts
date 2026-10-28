import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type pg from 'pg';
import { erc20Abi, parseAbi, parseEther, toHex, type Address, type Hex } from 'viem';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { INDEXED_CHAINS } from '../../src/chains';
import { connectTestDb, graphql, OTHER_ACCOUNT, TEST_ACCOUNT, testClients, waitForRows } from './harness';

// Tiket 19: Supply USDC di Anvil test Ethereum (globalSetup), lalu polling DB sampai row muncul. Anvil tanpa revert:
// tiap test mengirim tx-nya sendiri dan mencari row lewat hash-nya.
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const POOL = INDEXED_CHAINS[1].pool;
const poolAbi = parseAbi(['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)']);
const gatewayAbi = parseAbi(['function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable']);
const usdc = (n: number) => BigInt(n) * 1_000_000n;

const { publicClient, walletClient, testClient } = testClients(1);
let db: pg.Client;

async function confirmed(sent: Promise<Hex>) {
  const hash = await sent;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`tx ${hash} gagal`);
  return receipt;
}

async function supplyUsdc(amount: bigint, onBehalfOf: Address) {
  // Saldo USDC lewat `anvil_dealERC20` (mengatur saldo, tanpa holder).
  await testClient.request({ method: 'anvil_dealERC20', params: [TEST_ACCOUNT, USDC, toHex(amount)] } as never);
  await confirmed(walletClient.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [POOL, amount] }));
  return confirmed(walletClient.writeContract({ address: POOL, abi: poolAbi, functionName: 'supply', args: [USDC, amount, onBehalfOf, 0] }));
}

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
      reserve: USDC.toLowerCase(),
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
    const receipt = await confirmed(
      walletClient.writeContract({ address: AaveV3Ethereum.WETH_GATEWAY, abi: gatewayAbi, functionName: 'depositETH', args: [POOL, TEST_ACCOUNT, 0], value: parseEther('1') }),
    );

    const [row] = await waitForRows(db, receipt.transactionHash);

    expect(row).toMatchObject({
      owner: TEST_ACCOUNT.toLowerCase(),
      caller: AaveV3Ethereum.WETH_GATEWAY.toLowerCase(),
      tx_from: TEST_ACCOUNT.toLowerCase(),
      reserve: AaveV3Ethereum.ASSETS.WETH.UNDERLYING.toLowerCase(),
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
