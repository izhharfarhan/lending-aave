import { maxUint256 } from 'viem';

import { nextStep, type NextStepInput } from './nextStep';
import type { RepayPlan, WithdrawPlan } from './simulate';

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
  paused: false,
  native: false,
  action: { action: 'supply' },
  ...overrides,
});
// Borrow 100 USDC dengan jaminan cukup, HF sesudahnya ≥ 2.
const borrow = (action: Partial<Extract<NextStepInput['action'], { action: 'borrow' }>> = {}, overrides: Partial<NextStepInput> = {}) =>
  input({ balance: 0n, action: { action: 'borrow', hasCollateral: true, gate: 'none', ltvZero: false, riskChecked: false, riskTyped: false, ...action }, ...overrides });
// Repay 100 USDC sebagian (bukan lunas penuh).
const repay = (plan: RepayPlan | null = { full: false, send: USDC(100), spend: USDC(100), required: USDC(100) }, overrides: Partial<NextStepInput> = {}) =>
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

    it('disables every action on a paused (Dijeda) reserve, but still asks to connect first', () => {
      expect(nextStep(input({ paused: true }))).toEqual({ step: 'paused' });
      expect(nextStep(input({ paused: true, connected: false }))).toEqual({ step: 'connect' });
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
      const full: RepayPlan = { full: true, send: maxUint256, spend: USDC(100) + 12n, required: USDC(100) + 1n };

      expect(nextStep(repay(full, { allowance: USDC(100) }))).toEqual({ step: 'approve', amount: USDC(100) + 12n });
      expect(nextStep(repay(full, { allowance: USDC(100) + 12n }))).toEqual({ step: 'repay' });
    });

    it('does not ask for a second approve when interest grew a little after the cushioned approve', () => {
      // Dibaca ulang sesudah approve: utang + bantalan baru sedikit di atas izin, tapi izin masih menutup utang + 1 jam.
      const reread: RepayPlan = { full: true, send: maxUint256, spend: USDC(100) + 13n, required: USDC(100) + 2n };

      expect(nextStep(repay(reread, { allowance: USDC(100) + 12n }))).toEqual({ step: 'repay' });
    });

    it('blocks a repay above the wallet balance', () => {
      expect(nextStep(repay(undefined, { balance: USDC(99) }))).toEqual({ step: 'insufficientBalance' });
    });

    it('resets a leftover USDT allowance before approving the repay', () => {
      expect(nextStep(repay(undefined, { requiresApprovalReset: true, allowance: USDC(30) }))).toEqual({ step: 'resetApproval' });
    });
  });

  describe('withdraw', () => {
    // Tarik 100 USDC dari supply 500 USDC.
    const withdraw = (action: Partial<Extract<NextStepInput['action'], { action: 'withdraw' }>> = {}, overrides: Partial<NextStepInput> = {}) =>
      input({
        allowance: 0n,
        action: { action: 'withdraw', plan: { all: false, send: USDC(100), spend: USDC(100), required: USDC(100) }, gate: 'none', ltvZero: false, riskChecked: false, riskTyped: false, ...action },
        ...overrides,
      });

    it('withdraws without any approve', () => {
      expect(nextStep(withdraw())).toEqual({ step: 'withdraw' });
    });

    it('blocks withdrawing more than the supply, unless it is "withdraw everything"', () => {
      expect(nextStep(withdraw({}, { amount: USDC(501) }))).toEqual({ step: 'insufficientBalance' });
      expect(nextStep(withdraw({ plan: { all: true, send: maxUint256, spend: USDC(500) + 9n, required: USDC(500) + 1n } }, { amount: USDC(500) + 3n }))).toEqual({ step: 'withdraw' });
    });

    it('locks past the LTV limit, explains the LTV-0 rule, and asks for the stricter confirmations', () => {
      expect(nextStep(withdraw({ gate: 'locked' }))).toEqual({ step: 'overLtv' });
      expect(nextStep(withdraw({ ltvZero: true }))).toEqual({ step: 'ltvZero' });
      expect(nextStep(withdraw({ gate: 'check' }))).toEqual({ step: 'confirmRisk', gate: 'check' });
      expect(nextStep(withdraw({ gate: 'type', riskTyped: true }))).toEqual({ step: 'withdraw' });
    });
  });

  describe('collateral toggle', () => {
    const toggle = (action: Partial<Extract<NextStepInput['action'], { action: 'collateral' }>> = {}, overrides: Partial<NextStepInput> = {}) =>
      input({
        amount: null,
        action: { action: 'collateral', enable: false, canEnable: true, gate: 'none', ltvZero: false, riskChecked: false, riskTyped: false, ...action },
        ...overrides,
      });

    it('needs no amount: one transaction to turn collateral on or off', () => {
      expect(nextStep(toggle())).toEqual({ step: 'setCollateral' });
      expect(nextStep(toggle({ enable: true }))).toEqual({ step: 'setCollateral' });
    });

    it('locks turning off collateral the debt still needs, and the LTV-0 rule', () => {
      expect(nextStep(toggle({ gate: 'locked' }))).toEqual({ step: 'overLtv' });
      expect(nextStep(toggle({ ltvZero: true }))).toEqual({ step: 'ltvZero' });
      expect(nextStep(toggle({ gate: 'check' }))).toEqual({ step: 'confirmRisk', gate: 'check' });
    });

    it('refuses to turn on an asset that cannot be collateral (LTV 0)', () => {
      expect(nextStep(toggle({ enable: true, canEnable: false }))).toEqual({ step: 'cannotBeCollateral' });
    });

    it('still waits for the wallet, the data and the fork guard first', () => {
      expect(nextStep(toggle({}, { connected: false }))).toEqual({ step: 'connect' });
      expect(nextStep(toggle({}, { txLocked: true }))).toEqual({ step: 'locked' });
    });
  });

  describe('ETH lewat gateway', () => {
    // Saldo 500 ETH (helper `input`), jumlah dalam wei.
    const ETH = (n: number) => BigInt(n) * 10n ** 18n;
    const eth = (overrides: Partial<NextStepInput> = {}) => input({ native: true, amount: ETH(100), balance: ETH(500), ...overrides });
    it('supplies ETH straight away: no approve, no reset, whatever the allowance', () => {
      expect(nextStep(eth())).toEqual({ step: 'supply' });
      expect(nextStep(eth({ requiresApprovalReset: true, allowance: ETH(30) }))).toEqual({ step: 'supply' });
    });

    it('repays ETH without approve, also in full with the cushioned value', () => {
      const full: RepayPlan = { full: true, send: maxUint256, spend: ETH(100) + 12n, required: ETH(100) + 1n };
      const partial: RepayPlan = { full: false, send: ETH(100), spend: ETH(100), required: ETH(100) };

      expect(nextStep(eth({ action: { action: 'repay', plan: partial } }))).toEqual({ step: 'repay' });
      expect(nextStep(eth({ action: { action: 'repay', plan: full } }))).toEqual({ step: 'repay' });
    });

    // Withdraw ETH: gateway menarik aWETH dari wallet, jadi butuh izin aWETH → gateway (`allowance`); `balance` = saldo supply.
    const withdrawEth = (plan: WithdrawPlan, overrides: Partial<NextStepInput> = {}) =>
      eth({ action: { action: 'withdraw', plan, gate: 'none', ltvZero: false, riskChecked: false, riskTyped: false }, ...overrides });
    const partialWithdraw: WithdrawPlan = { all: false, send: ETH(100), spend: ETH(100), required: ETH(100) };
    const allWithdraw: WithdrawPlan = { all: true, send: maxUint256, spend: ETH(500) + 30n, required: ETH(500) + 2n };

    it('approves exactly the withdrawn aWETH to the gateway, then withdraws', () => {
      expect(nextStep(withdrawEth(partialWithdraw))).toEqual({ step: 'approve', amount: ETH(100) });
      expect(nextStep(withdrawEth(partialWithdraw, { allowance: ETH(99) }))).toEqual({ step: 'approve', amount: ETH(100) });
      expect(nextStep(withdrawEth(partialWithdraw, { allowance: ETH(100) }))).toEqual({ step: 'withdraw' });
      expect(nextStep(withdrawEth(partialWithdraw, { approvalMode: 'unlimited' }))).toEqual({ step: 'approve', amount: maxUint256 });
    });

    it('cushions the aWETH approve for "withdraw everything", and does not ask again once interest grew a little', () => {
      expect(nextStep(withdrawEth(allWithdraw, { amount: ETH(500), allowance: ETH(500) }))).toEqual({ step: 'approve', amount: ETH(500) + 30n });
      expect(nextStep(withdrawEth(allWithdraw, { amount: ETH(500), allowance: ETH(500) + 2n }))).toEqual({ step: 'withdraw' });
    });

    it('asks for the aWETH approve only after the risk is confirmed', () => {
      const risky = eth({ action: { action: 'withdraw', plan: partialWithdraw, gate: 'check', ltvZero: false, riskChecked: false, riskTyped: false } });
      expect(nextStep(risky)).toEqual({ step: 'confirmRisk', gate: 'check' });
      expect(nextStep(withdrawEth(partialWithdraw, { amount: ETH(501) }))).toEqual({ step: 'insufficientBalance' });
    });

    it('never resets an aWETH allowance to 0 first', () => {
      expect(nextStep(withdrawEth(partialWithdraw, { requiresApprovalReset: true, allowance: ETH(30) }))).toEqual({ step: 'approve', amount: ETH(100) });
    });

    it('asks to let the gateway borrow on your behalf (credit delegation) before borrowing ETH', () => {
      expect(nextStep(borrow({}, { native: true, amount: ETH(1) }))).toEqual({ step: 'delegate', amount: ETH(1) });
      expect(nextStep(borrow({}, { native: true, amount: ETH(1), allowance: ETH(1) - 1n }))).toEqual({ step: 'delegate', amount: ETH(1) });
      expect(nextStep(borrow({}, { native: true, amount: ETH(1), allowance: ETH(1) }))).toEqual({ step: 'borrow' });
      expect(nextStep(borrow({}, { native: true, amount: ETH(1), approvalMode: 'unlimited' }))).toEqual({ step: 'delegate', amount: maxUint256 });
    });

    it('asks for the delegation only after the risk checks', () => {
      expect(nextStep(borrow({ gate: 'locked' }, { native: true, amount: ETH(1) }))).toEqual({ step: 'overLtv' });
      expect(nextStep(borrow({ gate: 'type' }, { native: true, amount: ETH(1) }))).toEqual({ step: 'confirmRisk', gate: 'type' });
      expect(nextStep(borrow({ hasCollateral: false }, { native: true, amount: ETH(1) }))).toEqual({ step: 'needCollateral' });
    });

    it('still blocks an amount above the ETH balance', () => {
      expect(nextStep(eth({ amount: ETH(501) }))).toEqual({ step: 'insufficientBalance' });
      const full: RepayPlan = { full: true, send: maxUint256, spend: ETH(600), required: ETH(600) };
      expect(nextStep(eth({ action: { action: 'repay', plan: full } }))).toEqual({ step: 'insufficientBalance' });
    });
  });
});
