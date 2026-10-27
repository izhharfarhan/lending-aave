import { readFileSync } from 'node:fs';
import { maxUint256, type Address } from 'viem';

import { buildChainView, type ChainRead, type WhitelistAsset } from './chainPosition';
import { parseBigint } from './fixtures/bigintJson';
import { evaluatePanel, panelAssets, type PanelInput } from './panel';

type Fixture = Omit<ChainRead, 'user'> & { users: Record<string, NonNullable<ChainRead['user']>> };
const fixture = parseBigint<Fixture>(readFileSync('src/core/fixtures/ethereum.position.json', 'utf8'));
const { users, ...chain } = fixture;
const read = (label: string): ChainRead => ({ ...chain, user: users[label] });

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WHITELIST: WhitelistAsset[] = [
  { address: WETH, symbol: 'ETH', native: true },
  { address: USDC, symbol: 'USDC', native: false },
  { address: USDT, symbol: 'USDT', native: false, requiresApprovalReset: true },
];

const evaluate = (label: string, input: Partial<PanelInput>) => {
  const r = read(label);
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

  it('keeps repay open on a frozen reserve but not on a paused one', () => {
    const withUsdc = (flags: object): ChainRead => {
      const base = read('ethCollateralUsdcDebt');
      return { ...base, reserves: base.reserves.map((r) => (r.underlyingAsset === USDC ? { ...r, ...flags } : r)) };
    };
    expect(panelAssets(buildChainView(withUsdc({ isFrozen: true }), WHITELIST), 'repay').map((r) => r.symbol)).toEqual(['USDC']);
    expect(panelAssets(buildChainView(withUsdc({ isPaused: true }), WHITELIST), 'repay')).toEqual([]);
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
    expect(partial.plan).toEqual({ full: false, send: 150_000_000n, spend: 150_000_000n });
    expect(partial.step).toEqual({ step: 'approve', amount: 150_000_000n });
    expect(partial.sim?.account.healthFactor).toBeGreaterThan(1.30134);
    // Jumlah = seluruh utang, tapi wallet kurang: bukan lunas penuh, dan saldo nggak cukup.
    const tooMuch = evaluate('bahayaWithOutsideAssets', { tab: 'repay', amount: 4_000_000_000n });
    expect(tooMuch.plan?.full).toBe(false);
    expect(tooMuch.plan?.send).not.toBe(maxUint256);
    expect(tooMuch.step).toEqual({ step: 'insufficientBalance' });
  });
});
