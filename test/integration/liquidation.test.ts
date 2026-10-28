import { AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import type pg from 'pg';
import { parseAbi, parseEther, parseEventLogs, type Address, type Hex, type TransactionReceipt } from 'viem';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { PoolAbi } from '../../abis/PoolAbi';
import { aave } from './aave';
import { connectTestDb, graphql, lower, SCHEMA, usdc, waitForRows } from './harness';

// Tiket 21: likuidasi dari akun lain lewat mock oracle (alat yang sama dengan Dev Tools lending-web), lalu baris
// riwayat + rincian likuidasi dibandingkan dengan receipt tx-nya. Tiap test memakai borrower dan likuidator baru.
const usd8 = (n: number) => BigInt(Math.round(n * 1e8));
const RAY_HF = 10n ** 18n;
const receiptAbi = [
  ...PoolAbi.filter((item) => item.name === 'LiquidationCall'),
  ...parseAbi(['event DeficitCreated(address indexed user, address indexed debtAsset, uint256 amountCreated)', 'event Transfer(address indexed from, address indexed to, uint256 value)']),
];

const ethereum = aave(1);
const onBase = aave(8453);
let db: pg.Client;

beforeAll(async () => {
  db = await connectTestDb(inject('testDbUrl'));
});

afterAll(async () => {
  await db?.end();
});

// Harga oracle dikembalikan supaya file test lain di Anvil yang sama nggak ikut terpengaruh.
const touchedPrices: { chain: ReturnType<typeof aave>; asset: Address }[] = [];
afterEach(async () => {
  for (const { chain, asset } of touchedPrices.splice(0)) await chain.resetPrice(asset);
});
async function setPrice(chain: ReturnType<typeof aave>, asset: Address, price: bigint) {
  touchedPrices.push({ chain, asset });
  await chain.setPrice(asset, price);
}

async function freshAccount(chain: ReturnType<typeof aave>) {
  const account = privateKeyToAddress(generatePrivateKey());
  await chain.fund(account, parseEther('100'));
  return account;
}

// Kebenaran dari receipt, dibaca langsung dengan viem (bukan lewat kode indexer).
function fromReceipt(receipt: TransactionReceipt, { user, collateralAToken, treasury }: { user: Address; collateralAToken: Address; treasury: Address }) {
  const events = parseEventLogs({ abi: receiptAbi, logs: receipt.logs });
  const call = events.find((e) => e.eventName === 'LiquidationCall')!;
  const fee = events.find(
    (e) => e.eventName === 'Transfer' && lower(e.address) === lower(collateralAToken) && lower(e.args.from) === lower(user) && lower(e.args.to) === lower(treasury),
  );
  const deficits = events.filter((e) => e.eventName === 'DeficitCreated');
  return {
    call: call.args as { debtToCover: bigint; liquidatedCollateralAmount: bigint; liquidator: Address },
    logIndex: call.logIndex,
    protocolFee: fee?.eventName === 'Transfer' ? fee.args.value : 0n,
    deficits: deficits.map((e) => (e.eventName === 'DeficitCreated' ? e.args : undefined)!),
  };
}

// `int8[]` dibaca pg sebagai number JS (presisi hilang): dibaca sebagai teks.
const selectLiquidation = async (txHash: Hex) =>
  (await db.query(`SELECT *, deficit_amounts::text[] AS deficit_amounts FROM ${SCHEMA}.liquidation WHERE tx_hash = $1`, [txHash])).rows;

describe('liquidation (fork Ethereum)', () => {
  // 10 ETH jaminan, utang 15.000 USDC, ETH $1.800 → HF ≈ 0,996.
  it('records a liquidation sent by someone else under the borrower, with fee, reserve bonus, penalty, and HF before', async () => {
    const [borrower, liquidator] = [await freshAccount(ethereum), await freshAccount(ethereum)];
    await ethereum.depositEth(parseEther('10'), borrower);
    await ethereum.borrow(borrower, ethereum.usdc, usdc(15_000));
    await setPrice(ethereum, ethereum.weth, usd8(1_800));

    const receipt = await ethereum.liquidate(liquidator, { user: borrower, collateral: ethereum.weth, debt: ethereum.usdc, debtAmount: usdc(15_000) });

    const truth = fromReceipt(receipt, { user: borrower, collateralAToken: AaveV3Ethereum.ASSETS.WETH.A_TOKEN, treasury: ethereum.treasury });
    const hfBefore = await ethereum.healthFactorOf(borrower, receipt.blockNumber - 1n);
    const collateralLost = truth.call.liquidatedCollateralAmount + truth.protocolFee;
    const [row] = await waitForRows(db, receipt.transactionHash);
    const [details] = await selectLiquidation(receipt.transactionHash);

    expect(truth.protocolFee).toBeGreaterThan(0n);
    expect(row).toMatchObject({
      kind: 'liquidation',
      owner: lower(borrower),
      caller: lower(liquidator),
      tx_from: lower(liquidator),
      reserve: lower(ethereum.weth),
      amount: collateralLost.toString(),
      log_index: truth.logIndex,
      collateral_enabled: null,
    });
    expect(details).toMatchObject({
      owner: lower(borrower),
      liquidator: lower(liquidator),
      collateral_asset: lower(ethereum.weth),
      debt_asset: lower(ethereum.usdc),
      debt_to_cover: truth.call.debtToCover.toString(),
      liquidated_collateral_amount: truth.call.liquidatedCollateralAmount.toString(),
      protocol_fee: truth.protocolFee.toString(),
      liquidation_bonus: 10_500,
      bonus_from_e_mode: false,
      e_mode_category: 0,
      collateral_price: usd8(1_800).toString(),
      health_factor_before: hfBefore.toString(),
      deficit_assets: [],
      deficit_amounts: [],
    });
    expect(hfBefore).toBeLessThan(RAY_HF);
    // Sisa sesudah penalti = nilai utang yang dilunasi dalam ETH (USDC 6 desimal, ETH 18; harga oracle 8 desimal),
    // selisihnya cuma pembulatan.
    const penalty = BigInt(details.penalty);
    const debtInWeth = (truth.call.debtToCover * (await ethereum.priceOf(ethereum.usdc)) * 10n ** 12n) / usd8(1_800);
    expect(Number(collateralLost - penalty - debtInWeth)).toBeLessThan(Number(debtInWeth / 1_000_000n));
    expect(Number(debtInWeth - (collateralLost - penalty))).toBeLessThan(Number(debtInWeth / 1_000_000n));
  });

  // 1 ETH, utang 1.400 USDC, ETH $1.100: jaminan habis, sisa utang dihapus (`DeficitCreated`), dan jaminan nonaktif
  // otomatis (V3) digabung ke baris likuidasi.
  it('folds the automatic collateral disable into the liquidation row and keeps the deficit', async () => {
    const [borrower, liquidator] = [await freshAccount(ethereum), await freshAccount(ethereum)];
    await ethereum.depositEth(parseEther('1'), borrower);
    await ethereum.borrow(borrower, ethereum.usdc, usdc(1_400));
    await setPrice(ethereum, ethereum.weth, usd8(1_100));

    const receipt = await ethereum.liquidate(liquidator, { user: borrower, collateral: ethereum.weth, debt: ethereum.usdc, debtAmount: usdc(1_400) });

    const truth = fromReceipt(receipt, { user: borrower, collateralAToken: AaveV3Ethereum.ASSETS.WETH.A_TOKEN, treasury: ethereum.treasury });
    const rows = await waitForRows(db, receipt.transactionHash);
    const [details] = await selectLiquidation(receipt.transactionHash);

    expect(truth.deficits).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'liquidation', owner: lower(borrower), collateral_enabled: false });
    expect(details).toMatchObject({
      deficit_assets: [lower(ethereum.usdc)],
      deficit_amounts: [truth.deficits[0]!.amountCreated.toString()],
      protocol_fee: truth.protocolFee.toString(),
    });
  });

  // V5: user di E-Mode "ETH correlated" (kategori 1, bonus 101%) dengan jaminan wstETH yang ada di `collateralBitmap`.
  it('uses the E-Mode category bonus when the collateral is in the category bitmap', async () => {
    const wstEth = AaveV3Ethereum.ASSETS.wstETH.UNDERLYING;
    const [borrower, liquidator] = [await freshAccount(ethereum), await freshAccount(ethereum)];
    await ethereum.setUserEMode(borrower, 1);
    await ethereum.supply(borrower, wstEth, parseEther('10'));
    const [wstPrice, ethPrice] = [await ethereum.priceOf(wstEth), await ethereum.priceOf(ethereum.weth)];
    // 90% dari nilai jaminan (LTV kategori 93%); harga wstETH −10% → HF ≈ 0,95 × 0,9 / 0,9 < 1.
    const debt = (parseEther('10') * wstPrice * 9n) / (ethPrice * 10n);
    await ethereum.borrow(borrower, ethereum.weth, debt);
    await setPrice(ethereum, wstEth, (wstPrice * 9n) / 10n);

    const receipt = await ethereum.liquidate(liquidator, { user: borrower, collateral: wstEth, debt: ethereum.weth, debtAmount: debt });

    await waitForRows(db, receipt.transactionHash);
    const [details] = await selectLiquidation(receipt.transactionHash);
    expect(details).toMatchObject({ collateral_asset: lower(wstEth), liquidation_bonus: 10_100, bonus_from_e_mode: true, e_mode_category: 1 });
  });

  it('serves the liquidation details with the history row over /graphql', async () => {
    const [borrower, liquidator] = [await freshAccount(ethereum), await freshAccount(ethereum)];
    await ethereum.depositEth(parseEther('1'), borrower);
    await ethereum.borrow(borrower, ethereum.usdc, usdc(1_400));
    await setPrice(ethereum, ethereum.weth, usd8(1_100));
    const receipt = await ethereum.liquidate(liquidator, { user: borrower, collateral: ethereum.weth, debt: ethereum.usdc, debtAmount: usdc(1_400) });
    await waitForRows(db, receipt.transactionHash);

    type Item = { txHash: Hex; kind: string; liquidation: { liquidationBonus: number; deficitAssets: Address[]; healthFactorBefore: string | null } | null };
    const body = await graphql<{ positionEvents: { items: Item[] } }>(
      `query ($owner: String!) {
        positionEvents(where: { owner: $owner, kind_in: [liquidation] }) {
          items { txHash kind liquidation { liquidationBonus deficitAssets healthFactorBefore } }
        }
      }`,
      { owner: lower(borrower) },
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.positionEvents.items).toHaveLength(1);
    expect(body.data.positionEvents.items[0]).toMatchObject({
      txHash: receipt.transactionHash,
      kind: 'liquidation',
      liquidation: { liquidationBonus: 10_500, deficitAssets: [lower(ethereum.usdc)] },
    });
    expect(body.data.positionEvents.items[0]!.liquidation!.healthFactorBefore).not.toBeNull();
  });
});

describe('liquidation (fork Base, tanpa riwayat state)', () => {
  // Q16: blok −1 nggak bisa dibaca (Anvil Base `--prune-history 0`) → HF "tidak tersedia", baris tetap tercatat lengkap.
  // Lapisan RPC Ponder me-retry error itu 10× dengan backoff (±1 menit) sebelum handler menerima error-nya.
  it('keeps the liquidation row with the health factor unavailable when block −1 cannot be read', { timeout: 240_000 }, async () => {
    const [borrower, liquidator] = [await freshAccount(onBase), await freshAccount(onBase)];
    await onBase.depositEth(parseEther('1'), borrower);
    await onBase.borrow(borrower, onBase.usdc, usdc(1_400));
    await setPrice(onBase, onBase.weth, usd8(1_100));

    const receipt = await onBase.liquidate(liquidator, { user: borrower, collateral: onBase.weth, debt: onBase.usdc, debtAmount: usdc(1_400) });

    await expect(onBase.healthFactorOf(borrower, receipt.blockNumber - 1n)).rejects.toThrow();
    const [row] = await waitForRows(db, receipt.transactionHash, 1, 150_000);
    const [details] = await selectLiquidation(receipt.transactionHash);
    expect(row).toMatchObject({ chain_id: 8453, kind: 'liquidation', owner: lower(borrower) });
    expect(details).toMatchObject({ health_factor_before: null, liquidation_bonus: 10_500, collateral_price: usd8(1_100).toString() });
  });
});
