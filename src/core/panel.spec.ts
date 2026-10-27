import { readFileSync } from 'node:fs';
import { maxUint256, type Address } from 'viem';

import { buildChainView, type ChainRead, type WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { evaluatePanel, panelAssets, type PanelInput } from './panel';

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
    ...input,
  });
};

describe('panelAssets()', () => {
  it('offers ERC20 borrows from Pasar pinjam (ETH goes through the gateway later)', () => {
    const view = buildChainView(read('ethCollateralUsdcDebt'), WHITELIST);
    expect(panelAssets(view, 'borrow').map((r) => r.symbol)).toEqual(['USDC', 'USDT']);
  });

  it('offers only whitelisted ERC20 debts to repay, never outside assets or ETH debt', () => {
    expect(panelAssets(buildChainView(read('bahayaWithOutsideAssets'), WHITELIST), 'repay').map((r) => r.symbol)).toEqual(['USDC']);
    expect(panelAssets(buildChainView(read('ethDebtOutsideNonCollateral'), WHITELIST), 'repay')).toEqual([]);
  });

  it('keeps a frozen or paused position in the panel; the button decides what is allowed', () => {
    const view = buildChainView(withReserve('ethCollateralUsdcDebt', USDC, { isPaused: true }), WHITELIST);
    expect(panelAssets(view, 'repay')).toEqual([expect.objectContaining({ symbol: 'USDC', paused: true })]);
  });
});

describe('panelAssets(): withdraw & jaminan', () => {
  it('withdraws ERC20 supplies only, but lets ETH collateral be toggled directly on the Pool', () => {
    const view = buildChainView(read('ethDebtOutsideNonCollateral'), WHITELIST);

    // Supply: ETH, USDT (whitelist) + LINK (aset luar).
    expect(panelAssets(view, 'withdraw').map((r) => r.symbol)).toEqual(['USDT']);
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
    expect(evaluate('empty', {}).step).toEqual({ step: 'needCollateral' });
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

    expect(state.withdraw).toEqual({ all: true, send: maxUint256 });
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
});
