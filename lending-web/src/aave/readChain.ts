import { erc20Abi, multicall3Abi, type Address, type ContractFunctionParameters, type PublicClient } from 'viem';

import type { AaveContracts } from '@/config/contracts';
import type { AccountRead, ChainRead, EModeRead, ReserveRead, UserReserveRead, WhitelistAsset } from '@/core/chainPosition';
import { debtTokenAbi, poolAbi, poolEModeAbi, scaledSupplyAbi, uiPoolDataProviderAbi } from './abis';

type ReadChainArgs = {
  contracts: Pick<AaveContracts, 'pool' | 'poolAddressesProvider' | 'uiPoolDataProvider' | 'wrappedTokenGateway' | 'aWeth' | 'variableDebtWeth'>;
  whitelist: WhitelistAsset[];
  /** `undefined` = wallet belum terhubung: cukup data reserve (daftar aset + APY, Q6). */
  user: Address | undefined;
  /** Default: blok terbaru. Script fixture memakai blok pin. */
  blockNumber?: bigint;
};

// Reserve, posisi user, getUserAccountData, saldo wallet + izin ke Pool/gateway aset whitelist, dan timestamp blok di blok
// yang sama (satu multicall, plus satu untuk scaledTotalSupply aToken, id reserve, dan kategori E-Mode user), jadi HF dari
// kontrak, saldo, dan izin yang dibaca nextStep nggak pernah dari blok beda.
export async function readChain(client: PublicClient, { contracts, whitelist, user, blockNumber }: ReadChainArgs): Promise<ChainRead> {
  const multicall3 = client.chain?.contracts?.multicall3?.address;
  if (!multicall3) throw new Error(`Chain ${client.chain?.id} nggak punya alamat Multicall3`);
  const provider = contracts.poolAddressesProvider;

  const baseCalls: ContractFunctionParameters[] = [
    { address: contracts.uiPoolDataProvider, abi: uiPoolDataProviderAbi, functionName: 'getReservesData', args: [provider] },
    // Timestamp blok, bukan Date.now(): bunga dihitung sampai blok ini, dan di fork jam Anvil bisa beda (Q30).
    { address: multicall3, abi: multicall3Abi, functionName: 'getCurrentBlockTimestamp' },
    { address: contracts.pool, abi: poolEModeAbi, functionName: 'getReservesCount' },
  ];
  const erc20s = whitelist.filter((asset) => !asset.native);
  const hasNative = whitelist.some((asset) => asset.native);
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
        ...(hasNative
          ? [
              { address: contracts.aWeth, abi: erc20Abi, functionName: 'allowance', args: [user, contracts.wrappedTokenGateway] },
              {
                address: contracts.variableDebtWeth,
                abi: debtTokenAbi,
                functionName: 'borrowAllowance',
                args: [user, contracts.wrappedTokenGateway],
              },
            ]
          : []),
      ]
    : [];

  // `cacheTime: 0`: nomor blok cache viem bisa masih blok sebelum tx yang barusan masuk (pola swap-web).
  const block = blockNumber ?? (await client.getBlockNumber({ cacheTime: 0 }));
  const results = await client.multicall({ contracts: [...baseCalls, ...userCalls], allowFailure: false, blockNumber: block });

  // Array campuran ABI bikin tipe hasil multicall jadi `unknown`; urutannya tetap sesuai `contracts`.
  const [[reserveData, baseCurrency], blockTimestamp, reservesCount, userReserves, account, ...walletReads] = results as [
    readonly [readonly Omit<ReserveRead, 'id'>[], ChainRead['baseCurrency']],
    bigint,
    bigint,
    (readonly [readonly UserReserveRead[], number])?,
    (readonly [bigint, bigint, bigint, bigint, bigint, bigint])?,
    ...bigint[],
  ];

  // Yang baru bisa ditanyakan sesudah multicall pertama, di blok yang SAMA: `scaledTotalSupply` aToken (supply cap; alamat
  // aToken dari getReservesData), id tiap reserve (bit E-Mode; urutan getReservesData bukan id kalau ada reserve yang
  // pernah di-drop), dan kategori E-Mode user.
  const reserveOf = (asset: WhitelistAsset) => reserveData.find((r) => r.underlyingAsset.toLowerCase() === asset.address.toLowerCase());
  const listed = whitelist.filter((asset) => reserveOf(asset));
  const eModeId = userReserves?.[1] ?? 0;
  const pool = { address: contracts.pool, abi: poolEModeAbi } as const;
  const ids = Array.from({ length: Number(reservesCount) }, (_, id) => id);
  const second = await client.multicall({
    contracts: [
      ...listed.map((asset) => ({ address: reserveOf(asset)!.aTokenAddress, abi: scaledSupplyAbi, functionName: 'scaledTotalSupply' })),
      ...ids.map((id) => ({ ...pool, functionName: 'getReserveAddressById', args: [id] })),
      ...(eModeId !== 0 ? E_MODE_GETTERS.map((functionName) => ({ ...pool, functionName, args: [eModeId] })) : []),
    ] as ContractFunctionParameters[],
    allowFailure: false,
    blockNumber: block,
  });
  const scaledSupplies = second.slice(0, listed.length) as bigint[];
  const addressById = second.slice(listed.length, listed.length + ids.length) as Address[];
  const idOf = new Map(addressById.map((address, id) => [address.toLowerCase(), id]));
  const reserves = reserveData.map((r): ReserveRead => {
    const id = idOf.get(r.underlyingAsset.toLowerCase());
    if (id === undefined) throw new Error(`Id reserve ${r.underlyingAsset} nggak ditemukan`);
    return { ...r, id };
  });
  const eMode = eModeId !== 0 ? toEMode(eModeId, second.slice(listed.length + ids.length)) : null;

  return {
    blockTimestamp,
    reserves: [...reserves],
    scaledATokenSupplies: Object.fromEntries(listed.map((asset, i) => [asset.address, scaledSupplies[i]])),
    baseCurrency,
    user:
      userReserves && account
        ? {
            reserves: [...userReserves[0]],
            eMode,
            account: toAccount(account),
            walletBalances: Object.fromEntries(whitelist.map((asset, i) => [asset.address, walletReads[i]])),
            allowances: Object.fromEntries(erc20s.map((asset, i) => [asset.address, walletReads[whitelist.length + i]])),
            gatewayAllowances: hasNative ? gatewayAllowances(walletReads.slice(whitelist.length + erc20s.length)) : null,
          }
        : null,
  };
}

const gatewayAllowances = ([withdraw, borrow]: bigint[]) => ({ withdraw, borrow });

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

const E_MODE_GETTERS = [
  'getEModeCategoryCollateralConfig',
  'getEModeCategoryLabel',
  'getEModeCategoryCollateralBitmap',
  'getEModeCategoryBorrowableBitmap',
  'getEModeCategoryLtvzeroBitmap',
  'getIsEModeCategoryIsolated',
] as const;

function toEMode(id: number, values: unknown[]): EModeRead {
  const [config, label, collateralBitmap, borrowableBitmap, ltvzeroBitmap, isolated] = values as [
    { ltv: number; liquidationThreshold: number },
    string,
    bigint,
    bigint,
    bigint,
    boolean,
  ];
  return {
    id,
    label,
    ltv: BigInt(config.ltv),
    liquidationThreshold: BigInt(config.liquidationThreshold),
    collateralBitmap,
    borrowableBitmap,
    ltvzeroBitmap,
    isolated,
  };
}
