import { maxUint256 } from 'viem';

import { nextStep, type NextStepInput } from './nextStep';
import type { RepayPlan } from './simulate';

const USDC = (n: number) => BigInt(n) * 1_000_000n;

// Supply 100 USDC, saldo 500, belum ada izin ke Pool.
const input = (overrides: Partial<NextStepInput> = {}): NextStepInput => ({
  connected: true,
  txLocked: false,
  data: 'ready',
  txRunning: false,
  amount: USDC(100),
  balance: USDC(500),
  allowance: 0n,
  approvalMode: 'exact',
  requiresApprovalReset: false,
  action: { action: 'supply' },
  ...overrides,
});
// Borrow 100 USDC dengan jaminan cukup, HF sesudahnya ≥ 2.
const borrow = (action: Partial<Extract<NextStepInput['action'], { action: 'borrow' }>> = {}, overrides: Partial<NextStepInput> = {}) =>
  input({ balance: 0n, action: { action: 'borrow', hasCollateral: true, gate: 'none', riskChecked: false, riskTyped: false, ...action }, ...overrides });
// Repay 100 USDC sebagian (bukan lunas penuh).
const repay = (plan: RepayPlan | null = { full: false, send: USDC(100), spend: USDC(100) }, overrides: Partial<NextStepInput> = {}) =>
  input({ action: { action: 'repay', plan }, ...overrides });

describe('nextStep()', () => {
  describe('positive', () => {
    it('asks for an exact approve to the Pool first', () => {
      expect(nextStep(input())).toEqual({ step: 'approve', amount: USDC(100) });
    });

    it('approves unlimited only when the user picked it', () => {
      expect(nextStep(input({ approvalMode: 'unlimited' }))).toEqual({ step: 'approve', amount: maxUint256 });
    });

    it('goes straight to supply once the allowance covers the amount', () => {
      expect(nextStep(input({ allowance: USDC(100) }))).toEqual({ step: 'supply' });
      expect(nextStep(input({ allowance: maxUint256 }))).toEqual({ step: 'supply' });
    });

    it('lets the whole wallet balance be supplied', () => {
      expect(nextStep(input({ amount: USDC(500), allowance: USDC(500) }))).toEqual({ step: 'supply' });
    });
  });

  describe('negative', () => {
    it('asks to connect before anything else', () => {
      expect(nextStep(input({ connected: false, amount: null, data: 'loading' }))).toEqual({ step: 'connect' });
    });

    it('waits for the position, or reports it failed to load', () => {
      expect(nextStep(input({ data: 'loading' }))).toEqual({ step: 'loading' });
      expect(nextStep(input({ data: 'error' }))).toEqual({ step: 'loadFailed' });
    });

    it('locks every transaction while the fork guard is not safe', () => {
      expect(nextStep(input({ txLocked: true, allowance: USDC(100) }))).toEqual({ step: 'locked' });
    });

    it('stays busy while a transaction is running, even if the fork guard flips meanwhile', () => {
      expect(nextStep(input({ txRunning: true }))).toEqual({ step: 'busy' });
      expect(nextStep(input({ txRunning: true, txLocked: true }))).toEqual({ step: 'busy' });
    });

    it('asks for an amount when the input is empty or not a valid amount', () => {
      expect(nextStep(input({ amount: null }))).toEqual({ step: 'enterAmount' });
    });

    it('blocks an amount above the wallet balance before any approve is spent', () => {
      expect(nextStep(input({ amount: USDC(500) + 1n }))).toEqual({ step: 'insufficientBalance' });
    });

    it('asks for a bigger approve when the old allowance is too small', () => {
      expect(nextStep(input({ allowance: USDC(99) }))).toEqual({ step: 'approve', amount: USDC(100) });
    });
  });

  describe('edge case', () => {
    it('resets a leftover allowance to 0 first for a token that refuses non-zero → non-zero approve (USDT)', () => {
      expect(nextStep(input({ requiresApprovalReset: true, allowance: USDC(30) }))).toEqual({ step: 'resetApproval' });
      // Dari 0 langsung approve; sisa izin yang sudah cukup langsung supply.
      expect(nextStep(input({ requiresApprovalReset: true }))).toEqual({ step: 'approve', amount: USDC(100) });
      expect(nextStep(input({ requiresApprovalReset: true, allowance: USDC(100) }))).toEqual({ step: 'supply' });
    });
  });

  describe('borrow', () => {
    it('borrows straight away: no approve, no wallet balance needed', () => {
      expect(nextStep(borrow())).toEqual({ step: 'borrow' });
    });

    it('asks to supply collateral first when there is none, before asking for an amount', () => {
      expect(nextStep(borrow({ hasCollateral: false }, { amount: null }))).toEqual({ step: 'needCollateral' });
    });

    it('locks a borrow past the LTV limit', () => {
      expect(nextStep(borrow({ gate: 'locked', riskChecked: true, riskTyped: true }))).toEqual({ step: 'overLtv' });
    });

    it('lets an amber warning through but requires the checkbox or typed "confirm" for the stricter tiers', () => {
      expect(nextStep(borrow({ gate: 'warn' }))).toEqual({ step: 'borrow' });
      expect(nextStep(borrow({ gate: 'check' }))).toEqual({ step: 'confirmRisk', gate: 'check' });
      expect(nextStep(borrow({ gate: 'type' }))).toEqual({ step: 'confirmRisk', gate: 'type' });
      expect(nextStep(borrow({ gate: 'check', riskChecked: true }))).toEqual({ step: 'borrow' });
      expect(nextStep(borrow({ gate: 'type', riskTyped: true }))).toEqual({ step: 'borrow' });
    });

    it('does not let a ticked checkbox pass once the tier rises to typing "confirm"', () => {
      expect(nextStep(borrow({ gate: 'type', riskChecked: true }))).toEqual({ step: 'confirmRisk', gate: 'type' });
    });

    it('still asks for an amount before judging the risk', () => {
      expect(nextStep(borrow({ gate: 'locked' }, { amount: null }))).toEqual({ step: 'enterAmount' });
    });
  });

  describe('repay', () => {
    it('approves exactly the repaid amount, then repays', () => {
      expect(nextStep(repay())).toEqual({ step: 'approve', amount: USDC(100) });
      expect(nextStep(repay(undefined, { allowance: USDC(100) }))).toEqual({ step: 'repay' });
    });

    it('approves debt + interest cushion for a full repay sent as type(uint256).max', () => {
      const full: RepayPlan = { full: true, send: maxUint256, spend: USDC(100) + 12n };

      expect(nextStep(repay(full, { allowance: USDC(100) }))).toEqual({ step: 'approve', amount: USDC(100) + 12n });
      expect(nextStep(repay(full, { allowance: USDC(100) + 12n }))).toEqual({ step: 'repay' });
    });

    it('blocks a repay above the wallet balance', () => {
      expect(nextStep(repay(undefined, { balance: USDC(99) }))).toEqual({ step: 'insufficientBalance' });
    });

    it('resets a leftover USDT allowance before approving the repay', () => {
      expect(nextStep(repay(undefined, { requiresApprovalReset: true, allowance: USDC(30) }))).toEqual({ step: 'resetApproval' });
    });
  });
});
