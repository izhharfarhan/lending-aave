// Chain reads the Ponder handler gets from `context.client` (eth_call at the event's block,
// eth_getTransactionReceipt). They go through the Effect API, so they are batched during
// preload and cached in the database across restarts.
import { createEffect, S } from "envio";
import { BaseError, createPublicClient, erc20Abi, http, HttpRequestError, TimeoutError, type Address } from "viem";
import { OracleAbi, PoolReadAbi } from "../../abis/PoolAbi";
import { CHAINS, type ChainId } from "./chains";
import { liquidationFeeAndDeficits, type ReceiptLog } from "./liquidation";

// Archive-capable public endpoints. Set ENVIO_RPC_URL_<chainId> (comma-separated for several)
// to use your own; a dedicated archive node is recommended.
const DEFAULT_RPC: Record<ChainId, string[]> = {
  1: ["https://eth.drpc.org", "https://mainnet.gateway.tenderly.co", "https://eth-mainnet.public.blastapi.io"],
  8453: ["https://base.drpc.org", "https://base.gateway.tenderly.co", "https://base-mainnet.public.blastapi.io"],
  42161: ["https://arbitrum.gateway.tenderly.co", "https://arbitrum-one.public.blastapi.io", "https://arb-pokt.nodies.app"],
};

// batchSize 3 is the most drpc's free plan accepts.
// One client per endpoint; calls rotate over them so a free endpoint's rate limit is shared out,
// and a failed call is retried (see withRetry) on the next endpoint.
const pools = new Map<number, { clients: ReturnType<typeof createPublicClient>[]; next: number }>();
function clientFor(chainId: number) {
  let pool = pools.get(chainId);
  if (!pool) {
    const env = process.env[`ENVIO_RPC_URL_${chainId}`];
    const urls = env ? env.split(",").map((u) => u.trim()).filter(Boolean) : DEFAULT_RPC[chainId as ChainId];
    pool = {
      clients: urls.map((url) => createPublicClient({ transport: http(url, { batch: { batchSize: 3 }, retryCount: 2, timeout: 30_000 }) })),
      next: 0,
    };
    pools.set(chainId, pool);
  }
  return pool.clients[pool.next++ % pool.clients.length]!;
}

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const; // same address on every chain

const isTransportError = (error: unknown) =>
  error instanceof BaseError && error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError) !== null;

/** Retries transport failures (rate limits, timeouts); gives up after ten attempts and throws. */
async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  let delay = 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 10) {
        console.error(`${what} failed after ${attempt} attempts`);
        throw error;
      }
      console.warn(`RPC retry ${attempt} for ${what}: ${String(error).split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 20_000);
    }
  }
}

/**
 * Everything the Ponder `Pool:LiquidationCall` handler reads for one liquidation: reserve
 * configuration, reserve id, E-Mode category and its bonus/bitmap, collateral price and debt
 * balance at the liquidation block; health factor at block - 1; protocol fee and deficits from
 * the transaction receipt. Same reads, same blocks as lending-indexer/src/index.ts.
 */
export const liquidationReads = createEffect(
  {
    name: "liquidationReads",
    input: {
      blockNumber: S.number,
      txHash: S.string,
      logIndex: S.number,
      collateralAsset: S.string,
      debtAsset: S.string,
      user: S.string,
    },
    output: {
      reserveConfiguration: S.bigint,
      collateralReserveId: S.number,
      eModeCategory: S.number,
      eModeBonus: S.number,
      eModeBitmap: S.bigint,
      collateralPrice: S.bigint,
      // Unavailable (read failed after retries), as in Ponder's healthFactorAt fallback.
      healthFactorBefore: S.nullable(S.bigint),
      debtRemaining: S.bigint,
      protocolFee: S.bigint,
      deficitAssets: S.array(S.string),
      deficitAmounts: S.array(S.bigint),
    },
    cache: true,
    // Per chain. Free public endpoints fail under bursts; 4 liquidations/s (about 16 requests/s) keeps them answering.
    rateLimit: { calls: 4, per: "second" },
  },
  async ({ input, context }) => {
    const chainId = context.chain.id as ChainId;
    const { pool, treasury, oracle } = CHAINS[chainId];
    const blockNumber = BigInt(input.blockNumber);
    const collateralAsset = input.collateralAsset as Address;
    const debtAsset = input.debtAsset as Address;
    const user = input.user as Address;
    // Every attempt picks the next endpoint.
    const read = <T>(what: string, fn: (client: ReturnType<typeof clientFor>) => Promise<T>) =>
      withRetry(`${what}@${input.blockNumber}`, () => fn(clientFor(chainId)));

    // Reads at the liquidation block, grouped in Multicall3 calls (same block, same results as separate eth_calls).
    const first = (client: ReturnType<typeof clientFor>) =>
      client.multicall({
        multicallAddress: MULTICALL3,
        blockNumber,
        allowFailure: false,
        contracts: [
          { address: pool, abi: PoolReadAbi, functionName: "getReserveAToken", args: [collateralAsset] },
          { address: pool, abi: PoolReadAbi, functionName: "getConfiguration", args: [collateralAsset] },
          { address: pool, abi: PoolReadAbi, functionName: "getReserveData", args: [collateralAsset] },
          { address: pool, abi: PoolReadAbi, functionName: "getUserEMode", args: [user] },
          { address: oracle, abi: OracleAbi, functionName: "getAssetPrice", args: [collateralAsset] },
          { address: pool, abi: PoolReadAbi, functionName: "getReserveVariableDebtToken", args: [debtAsset] },
        ] as const,
      });
    const [[collateralAToken, configuration, reserveData, eModeCategory, collateralPrice, debtToken], receipt, healthFactorBefore] = await Promise.all([
      read("liquidation reads", first),
      read("getTransactionReceipt", (client) => client.getTransactionReceipt({ hash: input.txHash as `0x${string}` })),
      // Only this read has a fallback (Ponder: null when the node cannot serve block - 1).
      withRetry(`getUserAccountData@${input.blockNumber - 1}`, () =>
        clientFor(chainId).readContract({ address: pool, abi: PoolReadAbi, functionName: "getUserAccountData", args: [user], blockNumber: blockNumber - 1n }),
      ).then(
        (data) => data[5] as bigint | null,
        (error) => {
          // Null only when the node answered but cannot serve block - 1 (as Ponder does). A transport
          // failure must not be stored as "unavailable": stop instead and resume later.
          if (isTransportError(error)) throw error;
          return null;
        },
      ),
    ]);

    const eModeId = Number(eModeCategory);
    const [debtRemaining, ...eModeReads] = (await read("debt balance and E-Mode", (client) =>
      client.multicall({
        multicallAddress: MULTICALL3,
        blockNumber,
        allowFailure: false,
        contracts: [
          { address: debtToken, abi: erc20Abi, functionName: "balanceOf", args: [user] },
          ...(eModeId === 0
            ? []
            : ([
                { address: pool, abi: PoolReadAbi, functionName: "getEModeCategoryCollateralConfig", args: [eModeId] },
                { address: pool, abi: PoolReadAbi, functionName: "getEModeCategoryCollateralBitmap", args: [eModeId] },
              ] as const)),
        ] as never,
      }),
    )) as unknown as [bigint, ...unknown[]];
    const eModeConfig = eModeReads[0] as { liquidationBonus: number } | undefined;
    const eModeBonus = eModeConfig?.liquidationBonus ?? 0;
    const eModeBitmap = (eModeReads[1] as bigint | undefined) ?? 0n;

    const { protocolFee, deficits } = liquidationFeeAndDeficits(receipt.logs as unknown as ReceiptLog[], {
      pool,
      treasury,
      collateralAToken,
      user,
      logIndex: input.logIndex,
    });
    return {
      reserveConfiguration: configuration.data,
      collateralReserveId: reserveData.id,
      eModeCategory: eModeId,
      eModeBonus,
      eModeBitmap,
      collateralPrice,
      healthFactorBefore,
      debtRemaining,
      protocolFee,
      deficitAssets: deficits.map((d) => d.debtAsset),
      deficitAmounts: deficits.map((d) => d.amount),
    };
  },
);
