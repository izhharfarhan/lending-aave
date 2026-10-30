// Chain reads the Ponder handler gets from `context.client` (eth_call at the event's block,
// eth_getTransactionReceipt). They go through the Effect API, so they are batched during
// preload and cached in the database across restarts.
import { createEffect, S } from "envio";
import { createPublicClient, erc20Abi, fallback, http, type Address } from "viem";
import { OracleAbi, PoolReadAbi } from "../../abis/PoolAbi";
import { CHAINS, type ChainId } from "./chains";
import { liquidationFeeAndDeficits, type ReceiptLog } from "./liquidation";

// Archive-capable public endpoints. Set ENVIO_RPC_URL_<chainId> (comma-separated for several)
// to use your own; a dedicated archive node is recommended.
const DEFAULT_RPC: Record<ChainId, string[]> = {
  1: ["https://eth.drpc.org", "https://mainnet.gateway.tenderly.co", "https://eth-mainnet.public.blastapi.io"],
  8453: ["https://base.drpc.org", "https://base.gateway.tenderly.co", "https://base-mainnet.public.blastapi.io"],
  42161: ["https://arbitrum.gateway.tenderly.co", "https://1rpc.io/arb"],
};

const clients = new Map<number, ReturnType<typeof createPublicClient>>();
function clientFor(chainId: number) {
  let client = clients.get(chainId);
  if (!client) {
    const env = process.env[`ENVIO_RPC_URL_${chainId}`];
    const urls = env ? env.split(",").map((u) => u.trim()).filter(Boolean) : DEFAULT_RPC[chainId as ChainId];
    client = createPublicClient({
      transport: fallback(urls.map((url) => http(url, { batch: { batchSize: 20 }, retryCount: 5, timeout: 30_000 }))),
    });
    clients.set(chainId, client);
  }
  return client;
}

/** Retries transport failures (rate limits, timeouts); gives up after ten attempts and throws. */
async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  let delay = 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 10) throw new Error(`${what} failed after ${attempt} attempts: ${error}`);
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
    rateLimit: false,
  },
  async ({ input, context }) => {
    const chainId = context.chain.id as ChainId;
    const { pool, treasury, oracle } = CHAINS[chainId];
    const client = clientFor(chainId);
    const blockNumber = BigInt(input.blockNumber);
    const collateralAsset = input.collateralAsset as Address;
    const user = input.user as Address;
    const read = <T>(what: string, fn: () => Promise<T>) => withRetry(`${what}@${input.blockNumber}`, fn);

    const [collateralAToken, configuration, reserveData, eModeCategory, collateralPrice, receipt, healthFactorBefore, debtRemaining] =
      await Promise.all([
        read("getReserveAToken", () => client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getReserveAToken", args: [collateralAsset], blockNumber })),
        read("getConfiguration", () => client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getConfiguration", args: [collateralAsset], blockNumber })),
        read("getReserveData", () => client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getReserveData", args: [collateralAsset], blockNumber })),
        read("getUserEMode", () => client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getUserEMode", args: [user], blockNumber })),
        read("getAssetPrice", () => client.readContract({ address: oracle, abi: OracleAbi, functionName: "getAssetPrice", args: [collateralAsset], blockNumber })),
        read("getTransactionReceipt", () => client.getTransactionReceipt({ hash: input.txHash as `0x${string}` })),
        // Only this read has a fallback (Ponder: null when the node cannot serve block - 1).
        withRetry(`getUserAccountData@${input.blockNumber - 1}`, () =>
          client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getUserAccountData", args: [user], blockNumber: blockNumber - 1n }),
        ).then(
          (data) => data[5] as bigint | null,
          () => null,
        ),
        read("debtBalance", async () => {
          const debtToken = await client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getReserveVariableDebtToken", args: [input.debtAsset as Address], blockNumber });
          return client.readContract({ address: debtToken, abi: erc20Abi, functionName: "balanceOf", args: [user], blockNumber });
        }),
      ]);

    let eModeBonus = 0;
    let eModeBitmap = 0n;
    if (eModeCategory !== 0n) {
      const id = Number(eModeCategory);
      const [config, bitmap] = await Promise.all([
        read("getEModeCategoryCollateralConfig", () => client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getEModeCategoryCollateralConfig", args: [id], blockNumber })),
        read("getEModeCategoryCollateralBitmap", () => client.readContract({ address: pool, abi: PoolReadAbi, functionName: "getEModeCategoryCollateralBitmap", args: [id], blockNumber })),
      ]);
      eModeBonus = config.liquidationBonus;
      eModeBitmap = bitmap;
    }

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
      eModeCategory: Number(eModeCategory),
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
