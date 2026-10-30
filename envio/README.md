# Envio HyperIndex port of `lending-indexer`

This directory ports [`lending-indexer/`](../lending-indexer/README.md) to
[Envio HyperIndex](https://docs.envio.dev). It indexes the same Aave v3 Pool
events and the same aWETH `Transfer` filter on Ethereum, Base and Arbitrum and
fills the same four tables (`position_event`, `liquidation`, `tx_slot`,
`gateway_transfer`) with the same columns and ids. Event logs come from
HyperSync, so there is no `eth_getLogs` block-range limit and no need to start
at the latest block. The project targets `envio` 3.15.0.

Your Ponder indexer is untouched. The port sits beside it and has its own pnpm
lockfile. The pure logic in `src/lib/` (`collateralMerge`, `positionEvent`,
`liquidation`) is copied from `lending-indexer/src/core/` unchanged, and so are
their unit tests.

## Run it

You need Node.js 22.15 or later, pnpm 10, Docker (for `pnpm dev`) and an Envio
API token for HyperSync (<https://envio.dev/app/api-tokens>).

```bash
cd envio
pnpm install
cp .env.example .env     # set ENVIO_API_TOKEN
pnpm dev                 # Postgres + Hasura in Docker, then indexes
```

Hasura serves GraphQL at <http://localhost:8080>. Set the start blocks first;
see [Start blocks](#start-blocks).

```bash
pnpm codegen      # after editing config.yaml or schema.graphql
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest: the 47 unit tests from lending-indexer/test/core
```

### Start blocks

`config.yaml` reads `START_BLOCK_1`, `START_BLOCK_8453` and `START_BLOCK_42161`.
Set them to the Aave v3.7 upgrade blocks to index everything your handlers
support:

| Chain    | v3.7 upgrade block (Pool `POOL_REVISION` 10 to 11) | Date (UTC)  |
| -------- | ---------------------------------------------------- | ----------- |
| Ethereum | 25,199,939                                           | 2026-05-29  |
| Base     | 46,627,671                                           | 2026-05-29  |
| Arbitrum | 467,847,043                                          | 2026-05-29  |

Do not start earlier. The liquidation handler calls v3.7 getters
(`getEModeCategoryCollateralConfig`, `getEModeCategoryCollateralBitmap`,
`DeficitCreated` in the receipt) that older Pool implementations do not have,
so Ponder's handler would fail on older liquidations too. This is a property of
the existing handler, not of the port. Upgrade blocks come from the Pool
proxy's `Upgraded` events (HyperSync) and `POOL_REVISION()` before and after.

`END_BLOCK_<chainId>` stops a chain at a fixed block (used for the parity runs).

### RPC

The liquidation handler needs three kinds of chain reads that logs cannot give:
reserve, E-Mode and oracle state at the liquidation block, the health factor at
block minus 1, and the transaction receipt (protocol fee, deficits). They go
through the Effect API as one cached effect, `liquidationReads`, in
`src/lib/rpc.ts`: about three `eth_call`s (two of them Multicall3) plus one
`eth_getTransactionReceipt` per liquidation, rate-limited to 4 liquidations per
second per chain.

`ENVIO_RPC_URL_<chainId>` takes one archive endpoint or a comma-separated list;
calls rotate over the list. If unset, the indexer uses free public endpoints
(drpc, Tenderly, Blast, nodies). They work but throttle; use a dedicated
archive node for a long run. A failed request is retried with backoff and the
indexer stops after ten failures. The health factor read keeps your fallback
(stored as null when the node answers but cannot serve block minus 1), but a
transport error is never stored as null.

## What maps to what

| Ponder (`lending-indexer`)                                  | HyperIndex                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `ponder.config.ts`: Pool + AWeth contracts, `filter` on `to` | `config.yaml` + `where: {params: {to: gateway}}` on `AWeth:Transfer` |
| `ponder.schema.ts`                                           | `schema.graphql`                                                   |
| `src/index.ts` handlers                                      | `src/handlers/pool.ts`: same handlers, same order of operations    |
| `context.client.readContract` / `getTransactionReceipt`      | `liquidationReads` effect (`src/lib/rpc.ts`)                       |
| `src/core/*.ts`                                              | `src/lib/*.ts` (copied)                                            |
| `src/chains.ts` (address book)                               | `src/lib/chains.ts` (same addresses, lowercase)                    |
| `PONDER_MODE=fork`                                           | not ported                                                         |

## Differences a consumer will notice

- **Table names.** Entities are `PositionEvent`, `Liquidation`, `TxSlot` and
  `GatewayTransfer`; HyperIndex uses the entity name as the table name.
- **Keys.** Ponder's primary key `(chainId, txHash, logIndex)` is `(id, chainId)`
  here, with `id = "<txHash>-<logIndex>"` (`TxSlot`: `"<txHash>-<reserve>-<owner>"`,
  `GatewayTransfer`: `"<txHash>"`). `chainId`, `txHash` and `logIndex` are all
  still columns. Hex values are lowercase text, as in Ponder.
- **Relation.** Ponder exposes `positionEvent.liquidation`. Here `Liquidation` is a
  separate table with the same id; query it by owner and join on
  `(chainId, txHash, logIndex)`.
- **Query shape.** The API is Hasura's, not Ponder's. For lending-web:

  | Ponder (`src/aave/fetchIndexer.ts`)                                                       | HyperIndex (Hasura)                                                                                                       |
  | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
  | `positionEvents(where: {owner: $owner}, orderBy: "timestamp", orderDirection: "desc", limit: 1000) { items { … } }` | `PositionEvent(where: {owner: {_eq: $owner}}, order_by: {timestamp: desc}, limit: 1000) { … }` (a list, no `items`) |
  | nested `liquidation { … }`                                                                | second query `Liquidation(where: {owner: {_eq: $owner}}) { … }`, joined on chain, tx and log index                       |
  | `_meta { status }` (block per chain name)                                                 | `_meta { chainId progressBlock isReady }`                                                                                  |

  Not tested against lending-web. In particular I did not check how Hasura
  serializes `numeric` values above 2^53; check that before relying on `amount`.
- **No `fork` mode.** The port has no Anvil mode. With HyperSync there is no need
  for the `startBlock = latest` workaround or the 10-block `eth_getLogs`
  setting: set `START_BLOCK_*` and the full history is backfilled.
- **Ordering across chains.** Within a chain, events are processed in order, as in
  Ponder. Ponder orders events across chains by timestamp; HyperIndex does not.
  Nothing in these handlers reads across chains.

## Benchmark

The slice is the first 30,000 blocks after each chain's v3.7 upgrade: about
4 days on Ethereum, 17 hours on Base and 2 hours on Arbitrum. It holds 22,121
`position_event` rows (Ethereum 16,675, Base 5,093, Arbitrum 353, including 78
liquidations: 75 on Ethereum, 3 on Base). Both indexers ran on one
laptop (Apple Silicon, Postgres 17 in Docker), with other indexers running on the
same machine, so timings are noisy.

| Indexer                                   | Setup                                                        | Result                                                                 |
| ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| HyperIndex (envio 3.15.0)                 | HyperSync for logs, free public RPCs for the liquidation reads | all three slices, "Starting indexing" to "Ready": **27.9 s** (12 RPC retries) |
| Ponder 0.18.2 (`lending-indexer` as is)   | `ethGetLogsBlockRange: 10`, free public RPCs (drpc, Tenderly), mainnet mode, `endBlock` added | stopped after 42 min 23 s: Ethereum +17,322 blocks, Arbitrum +27,181, Base +324 |

Ponder's own estimate at the stop was `progress=1.1% estimate=30h 38m`; its log
had 870 lines `Unable to find available JSON-RPC provider` (free-tier rate limit).
Extrapolating the observed blocks per second to the whole slice (an
extrapolation, not a measurement): Ethereum 6.8 blocks/s, about 73 min;
Arbitrum 10.7 blocks/s, about 47 min; Base 0.13 blocks/s, about 65 hours.
The Ponder run was a single attempt on shared free endpoints. A paid RPC with a
larger `eth_getLogs` range would be much faster than this, so read the gap as
"this setup on free tiers", not as Ponder's ceiling.

HyperIndex timing split: logs come from HyperSync; the only RPC work is the 78
liquidations of the slice. The port limits that effect to 4 liquidations per
second per chain because unthrottled bursts made the free endpoints fail.

### Full v3.7 history

All three chains from the upgrade blocks to head (Ethereum 26,305,052, Base
53,283,852, Arbitrum 519,653,316 on 2026-10-30; 154 days), empty database:
**46 min 29 s** from "Starting indexing" to "Ready" (09:57:55 to 10:44:24 UTC),
with the same free public RPCs, 4,363 RPC retries and no failed request. It
wrote 2,629,989 `PositionEvent` rows (Ethereum 718,911, Base 1,233,105,
Arbitrum 677,973), 6,866 `Liquidation` rows (the same count as `LiquidationCall`
logs seen in HyperSync), 2,497,851 `TxSlot` and 76,256 `GatewayTransfer` rows,
in a 3.0 GB database.

Almost all of that time is the free RPC, not the indexer: handlers waited
2,736 s on the liquidation reads (`envio_preload_seconds`), against 34 s of
handler processing, 14 s stalled on HyperSync and 2 s on database writes. With a
dedicated archive RPC the run should be much shorter. This run was not compared
row by row with Ponder (Ponder could not reach this range); it was checked
against HyperSync counts only.

## Parity

Compared with the Ponder run above, row by row and field by field, up to the
block each chain had reached when Ponder was stopped (Ethereum 25,217,261, Base
46,627,995, Arbitrum 467,874,224). The HyperIndex rows beyond those blocks were
dropped before comparing.

| Table              | Ponder rows | HyperIndex rows | Matching |
| ------------------ | ----------- | --------------- | -------- |
| position_event     | 8,879       | 8,879           | 8,879    |
| liquidation        | 12          | 12              | 12       |
| tx_slot            | 8,781       | 8,781           | 8,781    |
| gateway_transfer   | 282         | 282             | 282      |

17,954 rows (those four tables, same key sets), no differences in any field,
including `amount`, `collateralEnabled`, the merged collateral rows, and the
RPC-derived liquidation fields (bonus, price, health factor at block minus 1,
protocol fee, deficits). Only 12 liquidations fall in the range Ponder reached,
so the liquidation path is checked on a small sample. `gateway_transfer` has no
block column in the original, so for that table only Ponder's rows were checked
against the HyperIndex rows.
