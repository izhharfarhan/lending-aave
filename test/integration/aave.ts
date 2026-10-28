import { AaveV3Arbitrum, AaveV3Base, AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddressEqual,
  keccak256,
  maxUint256,
  pad,
  parseAbi,
  parseEther,
  sliceHex,
  toBytes,
  toHex,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type TransactionReceipt,
} from 'viem';

import { INDEXED_CHAINS } from '../../src/chains';
import { TEST_ACCOUNT, testClients, type TestChainId } from './harness';

// Aksi Aave yang dikirim file test integrasi, per chain. Semua tx lewat `eth_sendUnsignedTransaction` Anvil (pola
// `sendFrom` Dev Tools lending-web), jadi pengirimnya bisa alamat mana saja: akun tes, pemilik posisi lain, likuidator,
// atau admin oracle.
const poolAbi = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)',
  'function setUserEMode(uint8 categoryId)',
  'function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
]);
const gatewayAbi = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable',
  'function withdrawETH(address pool, uint256 amount, address to)',
  'function borrowETH(address pool, uint256 amount, uint16 referralCode)',
  'function repayETH(address pool, uint256 amount, address onBehalfOf) payable',
]);
const debtTokenAbi = parseAbi(['function approveDelegation(address delegatee, uint256 amount)']);
const oracleAbi = parseAbi([
  'function getAssetPrice(address asset) view returns (uint256)',
  'function getSourceOfAsset(address asset) view returns (address)',
  'function setAssetSources(address[] assets, address[] sources)',
]);

// Arbitrum: USDC native = USDCn (V6).
const BOOKS = { 1: AaveV3Ethereum, 8453: AaveV3Base, 42161: AaveV3Arbitrum } as const satisfies Record<TestChainId, unknown>;
const RESERVES = {
  1: { usdc: AaveV3Ethereum.ASSETS.USDC.UNDERLYING, weth: AaveV3Ethereum.ASSETS.WETH },
  8453: { usdc: AaveV3Base.ASSETS.USDC.UNDERLYING, weth: AaveV3Base.ASSETS.WETH },
  42161: { usdc: AaveV3Arbitrum.ASSETS.USDCn.UNDERLYING, weth: AaveV3Arbitrum.ASSETS.WETH },
} as const satisfies Record<TestChainId, unknown>;

/**
 * Mock aggregator Chainlink yang sama dengan Dev Tools lending-web (`src/devtools/forkActions.ts`, tiket 18, V7): slot 0
 * = harga USD 8 desimal, slot 1 = sumber asli aset itu. Disalin, bukan di-import: file itu memakai alias `@/` dan viem
 * milik lending-web.
 */
const MOCK_AGGREGATOR_RUNTIME =
  '0x6080604052348015600e575f80fd5b5060043610603a575f3560e01c8063313ce56714603e57806350d25bcd146052578063cb233aac146066575b5f80fd5b604051600881526020015b60405180910390f35b60595f5481565b6040519081526020016049565b6001546078906001600160a01b031681565b6040516001600160a01b039091168152602001604956';
const mockAggregatorOf = (asset: Address): Address => getAddress(sliceHex(keccak256(toBytes(`lending-web/mock-aggregator/${asset.toLowerCase()}`)), 12));

type Writable = 'nonpayable' | 'payable';
type Call<abi extends Abi, name extends ContractFunctionName<abi, Writable>> = {
  address: Address;
  abi: abi;
  functionName: name;
  args: ContractFunctionArgs<abi, Writable, name>;
  value?: bigint;
};

export function aave(chainId: TestChainId) {
  const { publicClient, testClient } = testClients(chainId);
  const { pool, wethGateway: gateway, oracle } = INDEXED_CHAINS[chainId];
  const { usdc, weth } = RESERVES[chainId];
  const book = BOOKS[chainId];

  // Gas limit = estimasi + 20% (pola `withGasMargin` lending-web), sebagai pengaman: run pertama tiket 20 gagal di 3 tx
  // dengan estimasi polos, tapi penyebabnya belum diketahui (nggak terulang di reproduksi maupun run penuh tanpa margin).
  async function send<const abi extends Abi, name extends ContractFunctionName<abi, Writable>>(from: Address, call: Call<abi, name>) {
    const data = encodeFunctionData(call as never);
    const estimatedAt = await publicClient.getBlock();
    const estimate = await publicClient.estimateGas({ account: from, to: call.address, data, value: call.value });
    const gas = (estimate * 12n + 9n) / 10n;
    const hash = await testClient.sendUnsignedTransaction({ from, to: call.address, data, value: call.value, gas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`tx ${hash} gagal: ${await failureDetail(receipt, gas, estimate, estimatedAt.timestamp)}`);
    return receipt;
  }

  // Bukti kegagalan dikumpulkan selagi Anvil masih hidup (Anvil test mati di teardown): kehabisan gas vs revert, dan
  // jarak timestamp blok estimasi ke blok tambang (akrual bunga di antaranya bisa menambah gas).
  async function failureDetail(receipt: TransactionReceipt, gas: bigint, estimate: bigint, estimatedAtTimestamp: bigint) {
    const minedAt = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
    const trace = await publicClient
      .request({ method: 'debug_traceTransaction', params: [receipt.transactionHash, { disableStorage: true, disableStack: true, disableMemory: true }] } as never)
      .then((t: { failed?: boolean; returnValue?: string; structLogs?: { op: string; gas: number; depth: number }[] }) => {
        const last = t.structLogs?.at(-1);
        return `trace failed=${t.failed} returnValue=${t.returnValue || '0x'} lastOp=${last?.op} gasLeft=${last?.gas} depth=${last?.depth}`;
      })
      .catch((err: Error) => `trace gagal: ${err.message.slice(0, 200)}`);
    return `gasUsed ${receipt.gasUsed} dari limit ${gas} (estimasi ${estimate}); blok estimasi ts ${estimatedAtTimestamp} → blok tambang ${receipt.blockNumber} ts ${minedAt.timestamp}; ${trace}`;
  }

  // Saldo ERC20 lewat `anvil_dealERC20` (mengatur saldo, tanpa holder).
  const deal = (account: Address, token: Address, amount: bigint) =>
    testClient.request({ method: 'anvil_dealERC20', params: [account, token, toHex(amount)] } as never);
  const approve = (from: Address, token: Address, spender: Address, amount: bigint) =>
    send(from, { address: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount] });

  return {
    publicClient,
    pool,
    usdc,
    weth: weth.UNDERLYING,
    gateway,
    treasury: INDEXED_CHAINS[chainId].treasury,

    async supplyUsdc(amount: bigint, onBehalfOf: Address) {
      await deal(TEST_ACCOUNT, usdc, amount);
      await approve(TEST_ACCOUNT, usdc, pool, amount);
      return send(TEST_ACCOUNT, { address: pool, abi: poolAbi, functionName: 'supply', args: [usdc, amount, onBehalfOf, 0] });
    },

    // Supply ERC20 milik `from` sendiri (saldo di-deal dulu).
    async supply(from: Address, asset: Address, amount: bigint) {
      await deal(from, asset, amount);
      await approve(from, asset, pool, amount);
      return send(from, { address: pool, abi: poolAbi, functionName: 'supply', args: [asset, amount, from, 0] });
    },

    depositEth: (value: bigint, from: Address = TEST_ACCOUNT) =>
      send(from, { address: gateway, abi: gatewayAbi, functionName: 'depositETH', args: [pool, from, 0], value }),

    // `maxUint256` = seluruh saldo aWETH saat eksekusi; izin aWETH ke gateway dibuat maksimal supaya bunga tercakup.
    async withdrawEth(amount: bigint) {
      await approve(TEST_ACCOUNT, weth.A_TOKEN, gateway, maxUint256);
      return send(TEST_ACCOUNT, { address: gateway, abi: gatewayAbi, functionName: 'withdrawETH', args: [pool, amount, TEST_ACCOUNT] });
    },

    async borrowEth(amount: bigint) {
      await send(TEST_ACCOUNT, { address: weth.V_TOKEN, abi: debtTokenAbi, functionName: 'approveDelegation', args: [gateway, amount] });
      return send(TEST_ACCOUNT, { address: gateway, abi: gatewayAbi, functionName: 'borrowETH', args: [pool, amount, 0] });
    },

    repayEth: (amount: bigint) =>
      send(TEST_ACCOUNT, { address: gateway, abi: gatewayAbi, functionName: 'repayETH', args: [pool, amount, TEST_ACCOUNT], value: amount }),

    // Pemilik posisi sendiri yang harus memanggil Pool.
    setCollateral: (owner: Address, asset: Address, useAsCollateral: boolean) =>
      send(owner, { address: pool, abi: poolAbi, functionName: 'setUserUseReserveAsCollateral', args: [asset, useAsCollateral] }),

    borrow: (from: Address, asset: Address, amount: bigint) =>
      send(from, { address: pool, abi: poolAbi, functionName: 'borrow', args: [asset, amount, 2n, 0, from] }),

    setUserEMode: (from: Address, categoryId: number) => send(from, { address: pool, abi: poolAbi, functionName: 'setUserEMode', args: [categoryId] }),

    priceOf: (asset: Address) => publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: 'getAssetPrice', args: [asset] }),

    balanceOf: (token: Address, owner: Address, blockNumber?: bigint) =>
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner], blockNumber }),

    healthFactorOf: async (user: Address, blockNumber?: bigint) =>
      (await publicClient.readContract({ address: pool, abi: poolAbi, functionName: 'getUserAccountData', args: [user], blockNumber }))[5],

    /**
     * Harga aset di AaveOracle (USD 8 desimal) lewat mock aggregator, cara yang sama dengan Dev Tools lending-web:
     * `ACL_ADMIN` (punya POOL_ADMIN) mengarahkan oracle ke mock. Sumber asli disimpan di slot 1 untuk `resetPrice`.
     */
    async setPrice(asset: Address, price: bigint) {
      const mock = mockAggregatorOf(asset);
      await testClient.setStorageAt({ address: mock, index: toHex(0, { size: 32 }), value: toHex(price, { size: 32 }) });
      const current = await publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: 'getSourceOfAsset', args: [asset] });
      if (isAddressEqual(current, mock)) return;
      await testClient.setCode({ address: mock, bytecode: MOCK_AGGREGATOR_RUNTIME });
      await testClient.setStorageAt({ address: mock, index: toHex(1, { size: 32 }), value: pad(current) });
      await testClient.setBalance({ address: book.ACL_ADMIN, value: parseEther('1') });
      await send(book.ACL_ADMIN, { address: oracle, abi: oracleAbi, functionName: 'setAssetSources', args: [[asset], [mock]] });
    },

    async resetPrice(asset: Address) {
      const mock = mockAggregatorOf(asset);
      const current = await publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: 'getSourceOfAsset', args: [asset] });
      if (!isAddressEqual(current, mock)) return;
      const stored = await publicClient.getStorageAt({ address: mock, slot: toHex(1, { size: 32 }) });
      await send(book.ACL_ADMIN, { address: oracle, abi: oracleAbi, functionName: 'setAssetSources', args: [[asset], [getAddress(sliceHex(stored!, 12))]] });
    },

    /**
     * Likuidasi dari `liquidator` seperti Dev Tools lending-web: token utang di-deal secukupnya, approve ke Pool, lalu
     * `liquidationCall` dengan `debtToCover` = max (Pool membatasinya sendiri), jaminan diterima sebagai token biasa.
     */
    async liquidate(liquidator: Address, { user, collateral, debt, debtAmount }: { user: Address; collateral: Address; debt: Address; debtAmount: bigint }) {
      await deal(liquidator, debt, debtAmount * 2n);
      await approve(liquidator, debt, pool, maxUint256);
      return send(liquidator, { address: pool, abi: poolAbi, functionName: 'liquidationCall', args: [collateral, debt, user, maxUint256, false] });
    },

    // Akun baru per test: tanpa posisi dan tanpa kode (bukan akun bawaan yang di mainnet bisa punya delegasi 7702).
    fund: (account: Address, value: bigint) => testClient.setBalance({ address: account, value }),
  };
}
