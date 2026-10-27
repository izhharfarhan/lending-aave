import { AaveV3Base } from '@bgd-labs/aave-address-book';
import { parseEther } from 'viem';

import { buildChainView } from '@/core/chainPosition';
import { panelAssets, panelTx } from '@/core/panel';
import { forkClients, TEST_ACCOUNT } from '../../test/fork/clients';
import { supplyToReserve } from '../../test/fork/admin';
import { fundErc20 } from '../../test/fork/fund';
import { appOn } from '../../test/fork/likeTheApp';
import { fetchNetworkFee } from './fetchNetworkFee';
import { isWalletStep } from '@/core/nextStep';

// Kasus khusus Base (seam 3): L1 fee per transaksi (OP Stack) dan whitelist tanpa USDT.
const clients = forkClients(8453);
const app = appOn(clients);
const WETH = AaveV3Base.ASSETS.WETH.UNDERLYING;
const USDBC = AaveV3Base.ASSETS.USDbC.UNDERLYING;

describe('Base (fork)', () => {
  it('reads the Base pool with the address whitelist: ETH and USDC, no USDT; USDbC stays out of the markets', async () => {
    const view = buildChainView(await app.read(), app.whitelist);
    expect(panelAssets(view, 'supply').map((r) => r.symbol)).toEqual(['ETH', 'USDC']);
    expect(view.supplyMarket.some((r) => r.asset === USDBC)).toBe(false);
  });

  it('shows a USDbC supply as an outside asset: in the position, never in the action panel', async () => {
    const usdbc = (await app.read()).reserves.find((r) => r.underlyingAsset === USDBC)!;
    await fundErc20(USDBC, TEST_ACCOUNT, 100_000_000n, clients);
    await supplyToReserve(clients, AaveV3Base, app.contracts.pool, usdbc, 100_000_000n);

    const view = buildChainView(await app.read(), app.whitelist);
    expect(view.supplies.find((r) => r.asset === USDBC)).toMatchObject({ outside: true });
    expect(panelAssets(view, 'withdraw').some((r) => r.asset === USDBC)).toBe(false);
  });

  it('prices the network fee with the L1 fee of every transaction on top of L2 gas', async () => {
    await clients.testClient.setBalance({ address: TEST_ACCOUNT, value: parseEther('1') });
    const amount = parseEther('0.1');
    const state = await app.panelState('supply', WETH, amount);
    const step = state.stepBeforeGasCheck;
    if (!isWalletStep(step)) throw new Error(`Bukan langkah wallet: ${step.step}`);
    const row = panelAssets(buildChainView(await app.read(), app.whitelist), 'supply').find((r) => r.asset === WETH)!;

    const fee = await fetchNetworkFee(clients.publicClient, {
      chainId: 8453,
      contracts: app.contracts,
      account: TEST_ACCOUNT,
      asset: WETH,
      step,
      plan: panelTx(row, state, amount),
    });
    expect(fee.l1Fee).toBeGreaterThan(0n);
    expect(fee.wei).toBeGreaterThan(fee.l1Fee);
  });

  it('supplies ETH through the Base WrappedTokenGateway in one transaction', async () => {
    await clients.testClient.setBalance({ address: TEST_ACCOUNT, value: parseEther('1') });
    expect(await app.runLikeTheApp('supply', WETH, parseEther('0.1'))).toEqual([{ step: 'supply' }]);
    const supplied = buildChainView(await app.read(), app.whitelist).supplies.find((r) => r.symbol === 'ETH')!;
    expect(parseEther('0.1') - supplied.amount).toBeLessThanOrEqual(1n);
  });
});
