import { ponder, type Context } from 'ponder:registry';
import { gatewayTransfer, positionEvent, txSlot } from 'ponder:schema';
import { isAddressEqual, type Address, type Hex } from 'viem';

import { INDEXED_CHAINS, type IndexedChainId } from './chains';
import { actionAbsorbs, collateralJoins, type TxSlot } from './core/collateralMerge';
import { borrowRow, collateralRow, repayRow, supplyRow, withdrawRow, type PositionRow } from './core/positionEvent';

type Db = Context<'Pool:Supply'>['db'];

// Bagian event yang sama untuk semua handler.
type LogEvent = {
  transaction: { hash: Hex; from: Address };
  log: { logIndex: number };
  block: { timestamp: bigint; number: bigint };
};

const logOf = (event: LogEvent, chainId: number) => ({
  chainId,
  txHash: event.transaction.hash,
  logIndex: event.log.logIndex,
  txFrom: event.transaction.from,
  timestamp: event.block.timestamp,
  blockNumber: event.block.number,
});
type Log = ReturnType<typeof logOf>;

// Kunci tx_slot: alamat huruf kecil, sama dengan yang disimpan Ponder.
const slotKey = ({ chainId, txHash }: Log, { reserve, owner }: PositionRow) => ({
  chainId,
  txHash,
  reserve: reserve.toLowerCase() as Hex,
  owner: owner.toLowerCase() as Hex,
});

async function findSlot(db: Db, log: Log, row: PositionRow): Promise<TxSlot | undefined> {
  const slot = await db.find(txSlot, slotKey(log, row));
  if (!slot) return undefined;
  const target = await db.find(positionEvent, { chainId: log.chainId, txHash: log.txHash, logIndex: slot.logIndex });
  return target ? { logIndex: target.logIndex, kind: target.kind, collateralEnabled: target.collateralEnabled } : undefined;
}

async function insertRow(db: Db, log: Log, row: PositionRow) {
  await db.insert(positionEvent).values({ ...log, ...row });
  await db
    .insert(txSlot)
    .values({ ...slotKey(log, row), logIndex: log.logIndex })
    .onConflictDoUpdate({ logIndex: log.logIndex });
}

// Aksi (supply/withdraw/borrow/repay): event jaminan otomatis yang sudah tercatat lebih dulu di tx ini pindah ke barisnya.
async function recordAction(db: Db, log: Log, row: PositionRow) {
  const absorbed = actionAbsorbs(await findSlot(db, log, row), row.kind);
  if (absorbed) await db.delete(positionEvent, { chainId: log.chainId, txHash: log.txHash, logIndex: absorbed.logIndex });
  await insertRow(db, log, { ...row, collateralEnabled: absorbed?.collateralEnabled ?? null });
}

// Event jaminan: digabung ke baris aksinya kalau otomatis (V3), selain itu baris collateral sendiri (toggle manual).
async function recordCollateral(db: Db, log: Log, row: PositionRow) {
  const joined = collateralJoins(await findSlot(db, log, row), row.collateralEnabled!);
  if (joined === undefined) return insertRow(db, log, row);
  await db.update(positionEvent, { chainId: log.chainId, txHash: log.txHash, logIndex: joined }).set({ collateralEnabled: row.collateralEnabled });
}

ponder.on('Pool:Supply', async ({ event, context }) => {
  await recordAction(context.db, logOf(event, context.chain.id), supplyRow(event.args));
});

ponder.on('Pool:Borrow', async ({ event, context }) => {
  await recordAction(context.db, logOf(event, context.chain.id), borrowRow(event.args));
});

ponder.on('Pool:Repay', async ({ event, context }) => {
  await recordAction(context.db, logOf(event, context.chain.id), repayRow(event.args));
});

ponder.on('Pool:Withdraw', async ({ event, context }) => {
  const log = logOf(event, context.chain.id);
  // withdrawETH: `Withdraw.user` = gateway, pemiliknya pengirim aWETH ke gateway di tx yang sama (V2).
  const { wethGateway } = INDEXED_CHAINS[context.chain.id as IndexedChainId];
  const transfer = isAddressEqual(event.args.user, wethGateway) ? await context.db.find(gatewayTransfer, { chainId: log.chainId, txHash: log.txHash }) : null;
  await recordAction(context.db, log, withdrawRow(event.args, transfer?.from));
});

ponder.on('Pool:ReserveUsedAsCollateralEnabled', async ({ event, context }) => {
  await recordCollateral(context.db, logOf(event, context.chain.id), collateralRow(event.args, true));
});

ponder.on('Pool:ReserveUsedAsCollateralDisabled', async ({ event, context }) => {
  await recordCollateral(context.db, logOf(event, context.chain.id), collateralRow(event.args, false));
});

// Filter config: cuma `Transfer` aWETH yang tujuannya gateway.
ponder.on('AWeth:Transfer', async ({ event, context }) => {
  await context.db
    .insert(gatewayTransfer)
    .values({ chainId: context.chain.id, txHash: event.transaction.hash, from: event.args.from })
    .onConflictDoUpdate({ from: event.args.from });
});
