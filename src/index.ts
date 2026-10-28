import { ponder } from 'ponder:registry';
import { positionEvent } from 'ponder:schema';

import { supplyRow } from './core/positionEvent';

ponder.on('Pool:Supply', async ({ event, context }) => {
  await context.db.insert(positionEvent).values({
    chainId: context.chain.id,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    txFrom: event.transaction.from,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    ...supplyRow(event.args),
  });
});
