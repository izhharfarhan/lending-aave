import { AaveV3Arbitrum } from '@bgd-labs/aave-address-book';

import { buildChainView } from '@/core/chainPosition';
import { panelAssets } from '@/core/panel';
import { forkClients, TEST_ACCOUNT } from '../../test/fork/clients';
import { supplyToReserve } from '../../test/fork/admin';
import { fundErc20 } from '../../test/fork/fund';
import { appOn } from '../../test/fork/likeTheApp';

// Kasus khusus Arbitrum (seam 3): USDC native (USDCn di address-book) di whitelist, USDC.e (reserve Dibekukan) cuma
// muncul sebagai aset luar.
const clients = forkClients(42161);
const app = appOn(clients);
const USDC = AaveV3Arbitrum.ASSETS.USDCn.UNDERLYING;
const USDC_E = AaveV3Arbitrum.ASSETS.USDC.UNDERLYING;
const units = (n: number) => BigInt(n) * 1_000_000n;

describe('Arbitrum (fork)', () => {
  it('whitelists native USDC as "USDC"; the frozen USDC.e reserve is not offered', async () => {
    const chain = await app.read();
    const view = buildChainView(chain, app.whitelist);
    expect(panelAssets(view, 'supply').map((r) => [r.symbol, r.asset])).toEqual([
      ['ETH', AaveV3Arbitrum.ASSETS.WETH.UNDERLYING],
      ['USDC', USDC],
      ['USDT', AaveV3Arbitrum.ASSETS.USDT.UNDERLYING],
    ]);
    expect(chain.reserves.find((r) => r.underlyingAsset === USDC_E)?.isFrozen).toBe(true);
  });

  it('shows a USDC.e supply as a frozen outside asset: in the position, never in the action panel', async () => {
    // Posisi USDC.e disiapkan langsung lewat Pool (reserve-nya dicairkan sebentar oleh pool admin).
    await fundErc20(USDC_E, TEST_ACCOUNT, units(100), clients);
    const usdcE = (await app.read()).reserves.find((r) => r.underlyingAsset === USDC_E)!;
    await supplyToReserve(clients, AaveV3Arbitrum, app.contracts.pool, usdcE, units(100));

    const view = buildChainView(await app.read(), app.whitelist);
    expect(view.supplies.find((r) => r.asset === USDC_E)).toMatchObject({ outside: true, status: 'dibekukan' });
    expect(panelAssets(view, 'withdraw').some((r) => r.asset === USDC_E)).toBe(false);
  });

  it('supplies native USDC through the app path', async () => {
    await fundErc20(USDC, TEST_ACCOUNT, units(100), clients);
    expect(await app.runLikeTheApp('supply', USDC, units(100))).toEqual([{ step: 'approve', approveAmount: units(100) }, { step: 'supply' }]);
  });
});
