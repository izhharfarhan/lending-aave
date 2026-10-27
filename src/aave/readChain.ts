import { erc20Abi, multicall3Abi, type Address, type ContractFunctionParameters, type PublicClient } from 'viem';

import type { AaveContracts } from '@/config/contracts';
import type { AccountRead, ChainRead, ReserveRead, UserReserveRead, WhitelistAsset } from '@/core/chainPosition';
import { poolAbi, uiPoolDataProviderAbi } from './abis';

type ReadChainArgs = {
  contracts: Pick<AaveContracts, 'pool' | 'poolAddressesProvider' | 'uiPoolDataProvider'>;
  whitelist: WhitelistAsset[];
  /** `undefined` = wallet belum terhubung: cukup data reserve (daftar aset + APY, Q6). */
  user: Address | undefined;
  /** Default: blok terbaru. Script fixture memakai blok pin. */
  blockNumber?: bigint;
};

// Reserve, posisi user, getUserAccountData, saldo wallet + izin ke Pool aset whitelist, dan timestamp blok dalam SATU
// multicall di blok yang sama, jadi HF dari kontrak, saldo, dan izin yang dibaca nextStep nggak pernah dari blok beda.
export async function readChain(client: PublicClient, { contracts, whitelist, user, blockNumber }: ReadChainArgs): Promise<ChainRead> {
  const multicall3 = client.chain?.contracts?.multicall3?.address;
  if (!multicall3) throw new Error(`Chain ${client.chain?.id} nggak punya alamat Multicall3`);
  const provider = contracts.poolAddressesProvider;

  const baseCalls: ContractFunctionParameters[] = [
    { address: contracts.uiPoolDataProvider, abi: uiPoolDataProviderAbi, functionName: 'getReservesData', args: [provider] },
    // Timestamp blok, bukan Date.now(): bunga dihitung sampai blok ini, dan di fork jam Anvil bisa beda (Q30).
    { address: multicall3, abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp' },
  ];
  const erc20s = whitelist.filter((asset) => !asset.native);
  const userCalls: ContractFunctionParameters[] = user
    ? [
        { address: contracts.uiPoolDataProvider, abi: uiPoolDataProviderAbi, functionName: 'getUserReservesData', args: [provider, user] },
        { address: contracts.pool, abi: poolAbi, functionName: 'getUserAccountData', args: [user] },
        ...whitelist.map(
          (asset): ContractFunctionParameters =>
            asset.native
              ? { address: multicall3, abi: multicall3Abi, functionName: 'getEthBalance', args: [user] }
              : { address: asset.address, abi: erc20Abi, functionName: 'balanceOf', args: [user] },
        ),
        ...erc20s.map(
          (asset): ContractFunctionParameters => ({
            address: asset.address,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [user, contracts.pool],
          }),
        ),
      ]
    : [];

  // `cacheTime: 0`: nomor blok cache viem bisa masih blok sebelum tx yang barusan masuk (pola swap-web).
  const block = blockNumber ?? (await client.getBlockNumber({ cacheTime: 0 }));
  const results = await client.multicall({ contracts: [...baseCalls, ...userCalls], allowFailure: false, blockNumber: block });

  // Array campuran ABI bikin tipe hasil multicall jadi `unknown`; urutannya tetap sesuai `contracts`.
  const [[reserves, baseCurrency], blockTimestamp, userReserves, account, ...walletReads] = results as [
    readonly [readonly ReserveRead[], ChainRead['baseCurrency']],
    bigint,
    (readonly [readonly UserReserveRead[], number])?,
    (readonly [bigint, bigint, bigint, bigint, bigint, bigint])?,
    ...bigint[],
  ];

  return {
    blockTimestamp,
    reserves: [...reserves],
    baseCurrency,
    user:
      userReserves && account
        ? {
            reserves: [...userReserves[0]],
            eModeCategoryId: userReserves[1],
            account: toAccount(account),
            walletBalances: Object.fromEntries(whitelist.map((asset, i) => [asset.address, walletReads[i]])),
            allowances: Object.fromEntries(erc20s.map((asset, i) => [asset.address, walletReads[whitelist.length + i]])),
          }
        : null,
  };
}

function toAccount([totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor]: readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
]): AccountRead {
  return { totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor };
}
