import { maxUint256 } from 'viem';

import { nextStep, type NextStepInput } from './nextStep';

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
  ...overrides,
});

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
});
