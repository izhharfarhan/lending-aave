// Port of lending-indexer/src/index.ts: the same handlers, in the same order of operations.
import { indexer, type EvmOnEventContext } from "envio";
import type { Address, Hex } from "viem";
import { CHAINS, type ChainId } from "../lib/chains";
import { actionAbsorbs, collateralJoins, type TxSlot } from "../lib/collateralMerge";
import { liquidationDetail, liquidationRow } from "../lib/liquidation";
import { borrowRow, collateralRow, repayRow, supplyRow, withdrawRow, type CollateralArgs, type PositionRow } from "../lib/positionEvent";
import { liquidationReads } from "../lib/rpc";

type Context = EvmOnEventContext;

// Parts of the event shared by every handler.
type LogEvent = {
  chainId: number;
  logIndex: number;
  transaction: { hash: string; from?: string };
  block: { timestamp: number; number: number };
};

const metaOf = (event: LogEvent) => ({
  txHash: event.transaction.hash,
  logIndex: event.logIndex,
  txFrom: (event.transaction.from ?? "").toLowerCase(),
  timestamp: BigInt(event.block.timestamp),
  blockNumber: BigInt(event.block.number),
});
type RowMeta = ReturnType<typeof metaOf>;

// Entity ids. Rows are also keyed by chainId (disable_default_cross_chain), so the ids stay chain-free.
const rowId = (txHash: string, logIndex: number) => `${txHash}-${logIndex}`;
const slotId = (meta: RowMeta, row: PositionRow) => `${meta.txHash}-${row.reserve.toLowerCase()}-${row.owner.toLowerCase()}`;

async function findSlot(context: Context, meta: RowMeta, row: PositionRow): Promise<TxSlot | undefined> {
  const slot = await context.TxSlot.get(slotId(meta, row));
  if (!slot) return undefined;
  const target = await context.PositionEvent.get(rowId(meta.txHash, slot.logIndex));
  return target ? { logIndex: target.logIndex, kind: target.kind, collateralEnabled: target.collateralEnabled ?? null } : undefined;
}

function insertRow(context: Context, meta: RowMeta, row: PositionRow) {
  context.PositionEvent.set({
    id: rowId(meta.txHash, meta.logIndex),
    ...meta,
    ...row,
    owner: row.owner.toLowerCase(),
    caller: row.caller.toLowerCase(),
    reserve: row.reserve.toLowerCase(),
    amount: row.amount ?? undefined,
    collateralEnabled: row.collateralEnabled ?? undefined,
  });
  context.TxSlot.set({
    id: slotId(meta, row),
    txHash: meta.txHash,
    reserve: row.reserve.toLowerCase(),
    owner: row.owner.toLowerCase(),
    logIndex: meta.logIndex,
  });
}

// Action (supply/withdraw/borrow/repay): an automatic collateral event already recorded earlier in this tx moves into its row.
async function recordAction(context: Context, meta: RowMeta, row: PositionRow) {
  const absorbed = actionAbsorbs(await findSlot(context, meta, row), row.kind);
  if (absorbed) context.PositionEvent.deleteUnsafe(rowId(meta.txHash, absorbed.logIndex));
  insertRow(context, meta, { ...row, collateralEnabled: absorbed?.collateralEnabled ?? null });
}

// Collateral event: merged into its action row when automatic (V3), otherwise its own collateral row (manual toggle).
async function recordCollateral(context: Context, meta: RowMeta, args: CollateralArgs, enabled: boolean) {
  const row = collateralRow(args, enabled);
  const joined = collateralJoins(await findSlot(context, meta, row), enabled);
  if (joined === undefined) return insertRow(context, meta, row);
  const target = await context.PositionEvent.get(rowId(meta.txHash, joined));
  if (target) context.PositionEvent.set({ ...target, collateralEnabled: enabled });
}

const fields = { transaction: ["hash", "from"], block: ["number", "timestamp"] } as const;

indexer.onEvent({ contract: "Pool", event: "Supply", fields }, async ({ event, context }) => {
  await recordAction(context, metaOf(event), supplyRow(event.params as never));
});

indexer.onEvent({ contract: "Pool", event: "Borrow", fields }, async ({ event, context }) => {
  await recordAction(context, metaOf(event), borrowRow(event.params as never));
});

indexer.onEvent({ contract: "Pool", event: "Repay", fields }, async ({ event, context }) => {
  await recordAction(context, metaOf(event), repayRow(event.params as never));
});

indexer.onEvent({ contract: "Pool", event: "Withdraw", fields }, async ({ event, context }) => {
  const meta = metaOf(event);
  // withdrawETH: Withdraw.user = gateway; the owner sent aWETH to the gateway in the same tx (V2).
  const { wethGateway } = CHAINS[event.chainId as ChainId];
  const transfer = event.params.user.toLowerCase() === wethGateway ? await context.GatewayTransfer.get(meta.txHash) : undefined;
  await recordAction(context, meta, withdrawRow(event.params as never, transfer?.from as Address | undefined));
});

indexer.onEvent({ contract: "Pool", event: "ReserveUsedAsCollateralEnabled", fields }, async ({ event, context }) => {
  await recordCollateral(context, metaOf(event), event.params, true);
});

indexer.onEvent({ contract: "Pool", event: "ReserveUsedAsCollateralDisabled", fields }, async ({ event, context }) => {
  await recordCollateral(context, metaOf(event), event.params, false);
});

// Config filter: only aWETH Transfers whose destination is the gateway.
indexer.onEvent(
  {
    contract: "AWeth",
    event: "Transfer",
    fields,
    where: ({ chain }) => ({ params: { to: CHAINS[chain.id as ChainId].wethGateway as Hex } }),
  },
  async ({ event, context }) => {
    context.GatewayTransfer.set({ id: event.transaction.hash, txHash: event.transaction.hash, from: event.params.from.toLowerCase() });
  },
);

indexer.onEvent({ contract: "Pool", event: "LiquidationCall", fields }, async ({ event, context }) => {
  const meta = metaOf(event);
  const args = event.params;
  const reads = await context.effect(liquidationReads, {
    blockNumber: event.block.number,
    txHash: meta.txHash,
    logIndex: meta.logIndex,
    collateralAsset: args.collateralAsset,
    debtAsset: args.debtAsset,
    user: args.user,
  });
  const feeAndDeficits = {
    protocolFee: reads.protocolFee,
    deficits: reads.deficitAssets.map((debtAsset, i) => ({ debtAsset: debtAsset as Address, amount: reads.deficitAmounts[i]! })),
  };
  const eMode = reads.eModeCategory === 0 ? null : { categoryId: reads.eModeCategory, liquidationBonus: reads.eModeBonus, collateralBitmap: reads.eModeBitmap };

  await recordAction(context, meta, liquidationRow(args as never, feeAndDeficits.protocolFee));
  const detail = liquidationDetail(args as never, feeAndDeficits, {
    reserveConfiguration: reads.reserveConfiguration,
    collateralReserveId: reads.collateralReserveId,
    eMode,
    collateralPrice: reads.collateralPrice,
    healthFactorBefore: reads.healthFactorBefore ?? null,
    debtRemaining: reads.debtRemaining,
  });
  context.Liquidation.set({
    id: rowId(meta.txHash, meta.logIndex),
    txHash: meta.txHash,
    logIndex: meta.logIndex,
    ...detail,
    owner: detail.owner.toLowerCase(),
    liquidator: detail.liquidator.toLowerCase(),
    collateralAsset: detail.collateralAsset.toLowerCase(),
    debtAsset: detail.debtAsset.toLowerCase(),
    healthFactorBefore: detail.healthFactorBefore ?? undefined,
    deficitAssets: detail.deficitAssets.map((a) => a.toLowerCase()),
    timestamp: meta.timestamp,
  });
});
