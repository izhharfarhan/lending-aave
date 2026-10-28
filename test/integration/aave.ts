import { AaveV3Arbitrum, AaveV3Base, AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import { createWalletClient, erc20Abi, http, maxUint256, parseAbi, toHex, type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName, type WalletClient } from 'viem';

import { INDEXED_CHAINS } from '../../src/chains';
import { anvilUrl, TEST_ACCOUNT, TEST_CHAINS, testClients, type TestChainId } from './harness';

// Aksi Aave yang dikirim file test integrasi, per chain. Semua dari akun tes kecuali `setCollateral` (pemilik posisi
// sendiri yang harus memanggil Pool).
const poolAbi = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function setUserUseReserveAsCollateral(address asset, bool useAsCollateral)',
]);
const gatewayAbi = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable',
  'function withdrawETH(address pool, uint256 amount, address to)',
  'function borrowETH(address pool, uint256 amount, uint16 referralCode)',
  'function repayETH(address pool, uint256 amount, address onBehalfOf) payable',
]);
const debtTokenAbi = parseAbi(['function approveDelegation(address delegatee, uint256 amount)']);

// Arbitrum: USDC native = USDCn (V6).
const RESERVES = {
  1: { usdc: AaveV3Ethereum.ASSETS.USDC.UNDERLYING, weth: AaveV3Ethereum.ASSETS.WETH },
  8453: { usdc: AaveV3Base.ASSETS.USDC.UNDERLYING, weth: AaveV3Base.ASSETS.WETH },
  42161: { usdc: AaveV3Arbitrum.ASSETS.USDCn.UNDERLYING, weth: AaveV3Arbitrum.ASSETS.WETH },
} as const satisfies Record<TestChainId, unknown>;

export function aave(chainId: TestChainId) {
  const { publicClient, walletClient, testClient } = testClients(chainId);
  const { pool, wethGateway: gateway } = INDEXED_CHAINS[chainId];
  const { usdc, weth } = RESERVES[chainId];

  // Gas limit = estimasi + 20% (pola `withGasMargin` lending-web): dengan estimasi polos, supply USDC kedua dan
  // withdraw/repay ETH di Anvil fork bisa kehabisan gas.
  async function send<const abi extends Abi, name extends ContractFunctionName<abi, 'nonpayable' | 'payable'>>(
    wallet: WalletClient,
    request: { address: Address; abi: abi; functionName: name; args: ContractFunctionArgs<abi, 'nonpayable' | 'payable', name>; value?: bigint },
  ) {
    const account = wallet.account!;
    const estimate = await publicClient.estimateContractGas({ ...request, account } as never);
    const gas = (estimate * 12n + 9n) / 10n;
    const hash = await wallet.writeContract({ ...request, account, chain: wallet.chain, gas } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`tx ${hash} gagal (gasUsed ${receipt.gasUsed} dari limit ${gas})`);
    return receipt;
  }

  return {
    publicClient,
    usdc,
    weth: weth.UNDERLYING,
    gateway,

    async supplyUsdc(amount: bigint, onBehalfOf: Address) {
      // Saldo USDC lewat `anvil_dealERC20` (mengatur saldo, tanpa holder).
      await testClient.request({ method: 'anvil_dealERC20', params: [TEST_ACCOUNT, usdc, toHex(amount)] } as never);
      await send(walletClient, { address: usdc, abi: erc20Abi, functionName: 'approve', args: [pool, amount] });
      return send(walletClient, { address: pool, abi: poolAbi, functionName: 'supply', args: [usdc, amount, onBehalfOf, 0] });
    },

    depositEth: (value: bigint) => send(walletClient, { address: gateway, abi: gatewayAbi, functionName: 'depositETH', args: [pool, TEST_ACCOUNT, 0], value }),

    // `maxUint256` = seluruh saldo aWETH saat eksekusi; izin aWETH ke gateway dibuat maksimal supaya bunga tercakup.
    async withdrawEth(amount: bigint) {
      await send(walletClient, { address: weth.A_TOKEN, abi: erc20Abi, functionName: 'approve', args: [gateway, maxUint256] });
      return send(walletClient, { address: gateway, abi: gatewayAbi, functionName: 'withdrawETH', args: [pool, amount, TEST_ACCOUNT] });
    },

    async borrowEth(amount: bigint) {
      await send(walletClient, { address: weth.V_TOKEN, abi: debtTokenAbi, functionName: 'approveDelegation', args: [gateway, amount] });
      return send(walletClient, { address: gateway, abi: gatewayAbi, functionName: 'borrowETH', args: [pool, amount, 0] });
    },

    repayEth: (amount: bigint) => send(walletClient, { address: gateway, abi: gatewayAbi, functionName: 'repayETH', args: [pool, amount, TEST_ACCOUNT], value: amount }),

    // Anvil membuka semua akun bawaan, jadi pemilik lain bisa mengirim tx tanpa private key.
    setCollateral(owner: Address, asset: Address, useAsCollateral: boolean) {
      const ownerWallet = createWalletClient({ chain: TEST_CHAINS[chainId].chain, account: owner, transport: http(anvilUrl(chainId), { timeout: 120_000 }) });
      return send(ownerWallet, { address: pool, abi: poolAbi, functionName: 'setUserUseReserveAsCollateral', args: [asset, useAsCollateral] });
    },
  };
}
