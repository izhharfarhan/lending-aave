import { readFileSync } from 'node:fs';
import { maxUint256, type Address } from 'viem';

import { buildChainView, type ChainRead, type WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { evaluatePanel, panelAssets, panelTx, type PanelInput } from './panel';

type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chain } = fixture;
const read = (label: string): ChainRead => ({ ...chain, user: users[label] });
const withReserve = (label: string, asset: Address, flags: object): ChainRead => {
  const base = read(label);
  return { ...base, reserves: base.reserves.map((r) => (r.underlyingAsset === asset ? { ...r, ...flags } : r)) };
};

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WHITELIST: WhitelistAsset[] = [
  { address: WETH, symbol: 'ETH', native: true },
  { address: USDC, symbol: 'USDC', native: false },
  { address: USDT, symbol: 'USDT', native: false, requiresApprovalReset: true },
];

// Saldo ETH wallet (yang membayar biaya jaringan) diganti, sisanya sama dengan fixture.
const withEth = (label: string, eth: bigint): ChainRead => {
  const base = read(label);
  return { ...base, user: { ...base.user!, walletBalances: { ...base.user!.walletBalances, [WETH]: eth } } };
};

const evaluate = (label: string | ChainRead, input: Partial<PanelInput>) => {
  const r = typeof label === 'string' ? read(label) : label;
  return evaluatePanel(r, buildChainView(r, WHITELIST), WHITELIST, {
    connected: true,
    txLocked: false,
    txRunning: false,
    approvalMode: 'exact',
    tab: 'borrow',
    asset: USDC,
    amount: null,
    riskChecked: false,
    riskTyped: false,
    networkFee: null,
    ...input,
  });
};

describe('panelAssets()', () => {
  it('offers borrows from Pasar pinjam, ETH included (through the gateway)', () => {
    const view = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);
    expect(panelAssets(view, 'borrow').map((r) => [r.symbol, r.native])).toEqual([
      ['ETH', true],
      ['USDC', false],
      ['USDT', false],
    ]);
  });

  it('offers whitelisted debts to repay, ETH included (through the gateway), never outside assets', () => {
    expect(panelAssets(buildChainView(read('bahayaWithOutsideAssets'), WHITELIST), 'repay').map((r) => r.symbol)).toEqual(['USDC']);
    expect(panelAssets(buildChainView(read('ethDebtOutsideNonCollateral'), WHITELIST), 'repay')).toEqual([
      expect.objectContaining({ symbol: 'ETH', native: true }),
    ]);
  });

  it('offers ETH to supply next to the ERC20s', () => {
    expect(panelAssets(buildChainView(read('noDebt'), WHITELIST), 'supply').map((r) => [r.symbol, r.native])).toEqual([
      ['ETH', true],
      ['USDC', false],
      ['USDT', false],
    ]);
  });

  it('keeps a frozen or paused position in the panel; the button decides what is allowed', () => {
    const view = buildChainView(withReserve('ethCollateralUsdcDebt', USDC, { isPaused: true }), WHITELIST);
    expect(panelAssets(view, 'repay')).toEqual([expect.objectContaining({ symbol: 'USDC', paused: true })]);
  });
});

describe('panelAssets(): withdraw & jaminan', () => {
  it('withdraws whitelisted supplies, ETH included, and toggles collateral on all of them, never outside assets', () => {
    const view = buildChainView(read('ethDebtOutsideNonCollateral'), WHITELIST);

    // Supply: ETH, USDT (whitelist) + LINK (aset luar).
    expect(panelAssets(view, 'withdraw').map((r) => r.symbol)).toEqual(['ETH', 'USDT']);
    expect(panelAssets(view, 'collateral').map((r) => r.symbol)).toEqual(['ETH', 'USDT']);
  });
});

describe('evaluatePanel()', () => {
  it('feeds the simulated #9 tier into the main button', () => {
    // Batas pinjam 8.586,77 USDC: 8.586 USDC → HF 1,03 → wajib ketik "confirm".
    const state = evaluate('ethCollateralUsdcDebt', { amount: 8_586_000_000n });

    expect(state.sim?.gate).toBe('type');
    expect(state.step).toEqual({ step: 'confirmRisk', gate: 'type' });
    expect(evaluate('ethCollateralUsdcDebt', { amount: 8_586_000_000n, riskTyped: true }).step).toEqual({ step: 'borrow' });
  });

  it('asks for collateral first on a position without any', () => {
    // Wallet `empty` nggak punya ETH sama sekali; diberi sedikit supaya cek biaya jaringan lolos.
    expect(evaluate(withEth('empty', 10n ** 15n), {}).step).toEqual({ step: 'needCollateral' });
  });

  describe('biaya jaringan', () => {
    const fee = 2n * 10n ** 15n;

    it('locks the button when the wallet ETH cannot pay the fee, and still says which transactions the fee is for', () => {
      // Wallet bahayaWithOutsideAssets: 200 USDC tanpa izin ke Pool → supply 100 USDC butuh approve dulu.
      const state = evaluate(withEth('bahayaWithOutsideAssets', fee - 1n), { tab: 'supply', amount: 100_000_000n, networkFee: fee });
      expect(state.step).toEqual({ step: 'needsEthForGas', needed: fee });
      expect(state.stepBeforeGasCheck).toEqual({ step: 'approve', amount: 100_000_000n });
    });

    it('locks a wallet with 0 ETH before the fee is known (wallet `empty`)', () => {
      const state = evaluate('empty', {});
      expect(state.step).toEqual({ step: 'needsEthForGas', needed: null });
      expect(state.stepBeforeGasCheck).toEqual({ step: 'needCollateral' });
    });

    it('supply ETH: amount + fee must fit in the ETH balance', () => {
      // Wallet noDebt: 0,088035438238165435 ETH.
      const balance = 88_035_438_238_165_435n;
      expect(evaluate('noDebt', { tab: 'supply', asset: WETH, amount: balance - fee, networkFee: fee }).step).toEqual({ step: 'supply' });
      expect(evaluate('noDebt', { tab: 'supply', asset: WETH, amount: balance - fee + 1n, networkFee: fee }).step).toEqual({
        step: 'needsEthForGas',
        needed: balance + 1n,
      });
    });
  });

  it('plans a partial repay with an exact approve, and blocks a repay the wallet cannot pay', () => {
    // Utang USDC 3.775 lebih, wallet cuma 200 USDC: repay 150 USDC sebagian, approve exact 150.
    const partial = evaluate('bahayaWithOutsideAssets', { tab: 'repay', amount: 150_000_000n });
    expect(partial.repay).toEqual({ full: false, send: 150_000_000n, spend: 150_000_000n, required: 150_000_000n });
    expect(partial.step).toEqual({ step: 'approve', amount: 150_000_000n });
    expect(partial.sim?.account.healthFactor).toBeGreaterThan(1.30134);
    // Jumlah = seluruh utang, tapi wallet kurang: bukan lunas penuh, dan saldo nggak cukup.
    const tooMuch = evaluate('bahayaWithOutsideAssets', { tab: 'repay', amount: 4_000_000_000n });
    expect(tooMuch.repay?.full).toBe(false);
    expect(tooMuch.repay?.send).not.toBe(maxUint256);
    expect(tooMuch.step).toEqual({ step: 'insufficientBalance' });
  });

  it('opens the collateral toggle without an amount and locks turning off the only collateral', () => {
    const state = evaluate('ethCollateralUsdcDebt', { tab: 'collateral', asset: WETH });

    expect(state.sim?.gate).toBe('locked');
    expect(state.step).toEqual({ step: 'overLtv' });
    expect(evaluate('noDebt', { tab: 'collateral', asset: USDC }).step).toEqual({ step: 'setCollateral' });
  });

  it('withdraws everything with type(uint256).max when the amount is the whole supply', () => {
    // noDebt: supply USDC 223.714,70 tanpa utang.
    const supplied = buildChainView(read('noDebt'), WHITELIST).supplies[0].amount;
    const state = evaluate('noDebt', { tab: 'withdraw', asset: USDC, amount: supplied });

    expect(state.withdraw).toMatchObject({ all: true, send: maxUint256 });
    expect(state.step).toEqual({ step: 'withdraw' });
    expect(state.sim?.account.totalCollateralUsd).toBe(0);
  });

  // Spec 49–50: Dibekukan masih boleh withdraw dan repay; Dijeda menolak semua aksi.
  it('lets a frozen (Dibekukan) position withdraw and repay, and stops every action on a paused (Dijeda) one', () => {
    const frozen = withReserve('noDebt', USDC, { isFrozen: true });
    const paused = withReserve('noDebt', USDC, { isPaused: true });

    expect(evaluate(frozen, { tab: 'withdraw', asset: USDC, amount: 1_000_000n }).step).toEqual({ step: 'withdraw' });
    expect(evaluate(frozen, { tab: 'collateral', asset: USDC }).step).toEqual({ step: 'setCollateral' });
    expect(evaluate(withReserve('ethCollateralUsdcDebt', USDC, { isFrozen: true }), { tab: 'repay', asset: USDC, amount: 1_000_000n }).step)
      .toEqual({ step: 'approve', amount: 1_000_000n });
    expect(evaluate(paused, { tab: 'withdraw', asset: USDC, amount: 1_000_000n }).step).toEqual({ step: 'paused' });
    expect(evaluate(paused, { tab: 'collateral', asset: USDC }).step).toEqual({ step: 'paused' });
  });

  describe('ETH lewat gateway', () => {
    it('supplies ETH from the wallet ETH balance with no approve step', () => {
      // Wallet noDebt: 0,088035 ETH.
      expect(evaluate('noDebt', { tab: 'supply', asset: WETH, amount: 50_000_000_000_000_000n }).step).toEqual({ step: 'supply' });
      expect(evaluate('noDebt', { tab: 'supply', asset: WETH, amount: 90_000_000_000_000_000n }).step).toEqual({
        step: 'insufficientBalance',
      });
    });

    it('repays part of an ETH debt with exactly the typed ETH and no approve', () => {
      // Utang ETH ±3,63 tapi wallet cuma 0,0763 ETH: repay 0,05 ETH sebagian.
      const amount = 50_000_000_000_000_000n;
      const partial = evaluate('ethDebtOutsideNonCollateral', { tab: 'repay', asset: WETH, amount });
      const row = panelAssets(buildChainView(read('ethDebtOutsideNonCollateral'), WHITELIST), 'repay')[0];

      expect(partial.repay?.full).toBe(false);
      expect(partial.step).toEqual({ step: 'repay' });
      expect(panelTx(row, partial, amount)).toMatchObject({ send: amount, gateway: { value: amount } });
    });

    it('repays a whole ETH debt with type(uint256).max, sending debt + cushion as value', () => {
      // Posisi yang sama, wallet diisi 10 ETH supaya cukup untuk utang + bantalan.
      const base = read('ethDebtOutsideNonCollateral');
      const rich: ChainRead = { ...base, user: { ...base.user!, walletBalances: { ...base.user!.walletBalances, [WETH]: 10n * 10n ** 18n } } };
      const row = panelAssets(buildChainView(rich, WHITELIST), 'repay')[0];
      if (row.tab !== 'repay') throw new Error('baris repay');
      const state = evaluate(rich, { tab: 'repay', asset: WETH, amount: row.debt });

      expect(state.repay?.full).toBe(true);
      expect(state.step).toEqual({ step: 'repay' });
      expect(panelTx(row, state, row.debt)).toMatchObject({ send: maxUint256, shown: row.debt, gateway: { value: state.repay!.spend } });
      expect(state.repay!.spend).toBeGreaterThan(row.debt);
    });

    // ethCollateralUsdcDebt: supply ±5,32 ETH (jaminan), utang USDC, belum ada izin aWETH maupun delegation ke gateway.
    const ETH = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;
    const rowOf = (r: ChainRead, tab: PanelInput['tab']) => panelAssets(buildChainView(r, WHITELIST), tab).find((a) => a.asset === WETH)!;

    it('withdraws part of the ETH supply after an exact aWETH approve to the gateway, sending no ETH', () => {
      const state = evaluate('ethCollateralUsdcDebt', { tab: 'withdraw', asset: WETH, amount: ETH(0.1) });

      expect(state.step).toEqual({ step: 'approve', amount: ETH(0.1) });
      expect(panelTx(rowOf(read('ethCollateralUsdcDebt'), 'withdraw'), state, ETH(0.1))).toMatchObject({
        main: 'withdraw',
        send: ETH(0.1),
        gateway: { value: 0n },
      });
    });

    it('goes straight to withdrawETH when the aWETH allowance already covers it', () => {
      const base = read('ethCollateralUsdcDebt');
      const approved: ChainRead = { ...base, user: { ...base.user!, gatewayAllowances: { withdraw: ETH(0.1), borrow: 0n } } };

      expect(evaluate(approved, { tab: 'withdraw', asset: WETH, amount: ETH(0.1) }).step).toEqual({ step: 'withdraw' });
    });

    it('withdraws all ETH with type(uint256).max after an aWETH approve cushioned above the supply', () => {
      // Utang USDC dihapus supaya seluruh ETH boleh ditarik.
      const base = read('ethCollateralUsdcDebt');
      const debtFree: ChainRead = {
        ...base,
        user: { ...base.user!, reserves: base.user!.reserves.map((r) => ({ ...r, scaledVariableDebt: 0n })) },
      };
      const row = rowOf(debtFree, 'withdraw');
      if (row.tab !== 'withdraw') throw new Error('baris withdraw');
      const state = evaluate(debtFree, { tab: 'withdraw', asset: WETH, amount: row.supplied });

      expect(state.withdraw?.all).toBe(true);
      expect(state.withdraw!.spend).toBeGreaterThan(row.supplied);
      expect(state.step).toEqual({ step: 'approve', amount: state.withdraw!.spend });
      expect(panelTx(row, state, row.supplied)).toMatchObject({ send: maxUint256, shown: row.supplied, full: true, gateway: { value: 0n } });
    });

    it('borrows ETH after letting the gateway borrow on your behalf, sending no ETH', () => {
      const state = evaluate('ethCollateralUsdcDebt', { tab: 'borrow', asset: WETH, amount: ETH(0.1) });

      expect(state.step).toEqual({ step: 'delegate', amount: ETH(0.1) });
      expect(panelTx(rowOf(read('ethCollateralUsdcDebt'), 'borrow'), state, ETH(0.1))).toMatchObject({
        main: 'borrow',
        send: ETH(0.1),
        gateway: { value: 0n },
      });
    });

    it('toggles ETH collateral straight on the Pool, not through the gateway', () => {
      const row = panelAssets(buildChainView(read('ethCollateralUsdcDebt'), WHITELIST), 'collateral')[0];
      const state = evaluate('ethCollateralUsdcDebt', { tab: 'collateral', asset: WETH });

      expect(row.native).toBe(true);
      expect(panelTx(row, state, null).gateway).toBeNull();
    });
  });
});
