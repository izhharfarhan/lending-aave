import type pg from 'pg';
import { maxUint256, parseEther, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { forkStartBlock, INDEXED_CHAINS } from '../../src/chains';
import { aave } from './aave';
import { connectTestDb, graphql, OTHER_ACCOUNT, TEST_ACCOUNT, waitForRows } from './harness';

// Tiket 20: atribusi pemilik untuk semua event (#11, V2) dan penggabungan event jaminan otomatis (V3, Q18), di Anvil
// test 3 chain. Anvil tanpa revert: tiap test mengirim tx-nya sendiri dan mencari row lewat hash-nya.
const usdc = (n: number) => BigInt(n) * 1_000_000n;
const lower = (address: Address) => address.toLowerCase();

const ethereum = aave(1);
let db: pg.Client;

beforeAll(async () => {
  db = await connectTestDb(inject('testDbUrl'));
});

afterAll(async () => {
  await db?.end();
});

describe('position_event: ETH lewat WrappedTokenGateway (fork Ethereum)', () => {
  beforeAll(async () => {
    // Jaminan untuk borrowETH.
    await ethereum.supplyUsdc(usdc(10_000), TEST_ACCOUNT);
  });

  // V2: `Borrow.user` = gateway, yang berutang = `onBehalfOf`.
  it('records borrowETH under the borrower, with the gateway as caller', async () => {
    const receipt = await ethereum.borrowEth(parseEther('0.1'));

    const [row] = await waitForRows(db, receipt.transactionHash);

    expect(row).toMatchObject({
      kind: 'borrow',
      owner: lower(TEST_ACCOUNT),
      caller: lower(ethereum.gateway),
      reserve: lower(ethereum.weth),
      amount: parseEther('0.1').toString(),
      collateral_enabled: null,
    });
  });

  // V2: `repayer` = gateway, yang utangnya berkurang = `Repay.user`.
  it('records repayETH under the user whose debt shrinks, with the gateway as caller', async () => {
    const receipt = await ethereum.repayEth(parseEther('0.05'));

    const [row] = await waitForRows(db, receipt.transactionHash);

    expect(row).toMatchObject({ kind: 'repay', owner: lower(TEST_ACCOUNT), caller: lower(ethereum.gateway), amount: parseEther('0.05').toString() });
  });

  // V2: `Withdraw.user` = `to` = gateway; pemilik dari `Transfer` aWETH user → gateway di tx yang sama.
  it('records withdrawETH under the aWETH sender, not the gateway', async () => {
    await ethereum.depositEth(parseEther('1'));
    const receipt = await ethereum.withdrawEth(parseEther('0.4'));

    const [row] = await waitForRows(db, receipt.transactionHash);

    expect(row).toMatchObject({
      kind: 'withdraw',
      owner: lower(TEST_ACCOUNT),
      caller: lower(ethereum.gateway),
      reserve: lower(ethereum.weth),
      amount: parseEther('0.4').toString(),
      // Masih ada sisa aWETH: jaminan nggak berubah.
      collateral_enabled: null,
    });
  });
});

describe('position_event: event jaminan (fork Ethereum)', () => {
  // Supply pertama: `ReserveUsedAsCollateralEnabled` terpancar otomatis, jadi satu baris "Supply · jaminan aktif".
  it('folds the automatic collateral enable of a first supply into the supply row', async () => {
    const fresh = privateKeyToAddress(generatePrivateKey());

    const receipt = await ethereum.supplyUsdc(usdc(100), fresh);

    const rows = await waitForRows(db, receipt.transactionHash);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'supply', owner: lower(fresh), amount: usdc(100).toString(), collateral_enabled: true });
  });

  // withdrawETH semua: transfer seluruh aWETH ke gateway memancarkan `ReserveUsedAsCollateralDisabled(user)` sebelum
  // `Withdraw(gateway)`; tetap satu baris milik user.
  it('folds the automatic collateral disable of withdrawing all ETH into the withdraw row', async () => {
    await ethereum.depositEth(parseEther('0.5'));

    const receipt = await ethereum.withdrawEth(maxUint256);

    const rows = await waitForRows(db, receipt.transactionHash);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'withdraw', owner: lower(TEST_ACCOUNT), caller: lower(ethereum.gateway), collateral_enabled: false });
  });

  it('keeps manual toggles as collateral rows of their own, without an amount', async () => {
    await ethereum.supplyUsdc(usdc(100), OTHER_ACCOUNT);

    const off = await ethereum.setCollateral(OTHER_ACCOUNT, ethereum.usdc, false);
    const on = await ethereum.setCollateral(OTHER_ACCOUNT, ethereum.usdc, true);

    const [offRow] = await waitForRows(db, off.transactionHash);
    const [onRow] = await waitForRows(db, on.transactionHash);
    const toggle = { kind: 'collateral', owner: lower(OTHER_ACCOUNT), caller: lower(OTHER_ACCOUNT), reserve: lower(ethereum.usdc), amount: null };
    expect(offRow).toMatchObject({ ...toggle, collateral_enabled: false });
    expect(onRow).toMatchObject({ ...toggle, collateral_enabled: true });
  });
});

describe('position_event: Base & Arbitrum', () => {
  // Gateway & aWETH beda per chain: filter `Transfer` ke gateway harus jalan di tiap chain.
  it.each([8453, 42161] as const)('records ETH deposit and withdrawal on chain %i under the user', async (chainId) => {
    const chain = aave(chainId);

    const deposit = await chain.depositEth(parseEther('0.5'));
    const withdraw = await chain.withdrawEth(parseEther('0.2'));

    const [depositRow] = await waitForRows(db, deposit.transactionHash);
    const [withdrawRow] = await waitForRows(db, withdraw.transactionHash);
    const ofUser = { chain_id: chainId, owner: lower(TEST_ACCOUNT), caller: lower(chain.gateway), reserve: lower(chain.weth) };
    expect(depositRow).toMatchObject({ ...ofUser, kind: 'supply', amount: parseEther('0.5').toString() });
    expect(withdrawRow).toMatchObject({ ...ofUser, kind: 'withdraw', amount: parseEther('0.2').toString() });
  });
});

describe('/graphql', () => {
  type Item = { chainId: number; kind: string; txHash: Hex };

  // Riwayat semua chain per alamat dengan filter chain + jenis (Q18).
  it('filters one owner history by chain and kind', async () => {
    const base = aave(8453);
    await base.depositEth(parseEther('0.1'));
    const baseWithdraw = await base.withdrawEth(parseEther('0.1'));
    const ethereumSupply = await ethereum.supplyUsdc(usdc(10), TEST_ACCOUNT);
    await waitForRows(db, baseWithdraw.transactionHash);
    await waitForRows(db, ethereumSupply.transactionHash);

    const body = await graphql<{ positionEvents: { items: Item[] } }>(
      `query ($owner: String!) {
        positionEvents(where: { owner: $owner, chainId_in: [8453], kind_in: [withdraw] }, orderBy: "timestamp", orderDirection: "desc", limit: 1000) {
          items { chainId kind txHash }
        }
      }`,
      { owner: lower(TEST_ACCOUNT) },
    );

    expect(body.errors).toBeUndefined();
    const { items } = body.data.positionEvents;
    expect(items.map((item) => item.txHash)).toContain(baseWithdraw.transactionHash);
    expect(items.map((item) => item.txHash)).not.toContain(ethereumSupply.transactionHash);
    expect(items.every((item) => item.chainId === 8453 && item.kind === 'withdraw')).toBe(true);
  });

  // Status sinkron per chain untuk badge indexer: blok terakhir yang sudah di-index (`_meta` bawaan Ponder).
  it('reports the indexed block per chain', async () => {
    const body = await graphql<{ _meta: { status: Record<string, { id: number; block: { number: number; timestamp: number } }> } }>(`{ _meta { status } }`, {});

    expect(body.errors).toBeUndefined();
    const { status } = body.data._meta;
    for (const chainId of [1, 8453, 42161] as const) {
      const chain = status[INDEXED_CHAINS[chainId].name];
      expect(chain?.id).toBe(chainId);
      expect(chain!.block.number).toBeGreaterThanOrEqual(forkStartBlock(chainId));
    }
  });
});
