import type { Address } from 'viem';
import { describe, expect, it } from 'vitest';

import { borrowRow, collateralRow, repayRow, supplyRow, withdrawRow } from '../../src/core/positionEvent';

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
// WrappedTokenGatewayV3 Ethereum: pemanggil Pool untuk aksi ETH (V2).
const GATEWAY: Address = '0xd01607c3C5eCABa394D8be377a08590149325722';

describe('supplyRow()', () => {
  it('records the position under onBehalfOf, keeping the Pool caller apart', () => {
    expect(supplyRow({ reserve: USDC, user: USER, onBehalfOf: USER, amount: 1_000_000n })).toEqual({
      kind: 'supply',
      owner: USER,
      caller: USER,
      reserve: USDC,
      amount: 1_000_000n,
      collateralEnabled: null,
    });
  });

  // #11: pemilik bukan pemanggil Pool, juga bukan `tx.from`.
  it.each([
    ['supply ETH lewat gateway', GATEWAY, USER],
    ['supply atas nama alamat lain', USER, OTHER],
  ] as const)('owner = onBehalfOf for %s', (_label, user, onBehalfOf) => {
    expect(supplyRow({ reserve: USDC, user, onBehalfOf, amount: 1n })).toMatchObject({ owner: onBehalfOf, caller: user });
  });
});

describe('borrowRow()', () => {
  // borrowETH: `Borrow.user` = gateway, yang berutang = `onBehalfOf` (V2).
  it.each([
    ['borrow biasa', USER, USER],
    ['borrow ETH lewat gateway', GATEWAY, USER],
  ] as const)('owner = onBehalfOf for %s', (_label, user, onBehalfOf) => {
    expect(borrowRow({ reserve: WETH, user, onBehalfOf, amount: 5n })).toEqual({
      kind: 'borrow',
      owner: onBehalfOf,
      caller: user,
      reserve: WETH,
      amount: 5n,
      collateralEnabled: null,
    });
  });
});

describe('repayRow()', () => {
  // repayETH: `repayer` = gateway, yang utangnya berkurang = `user` (V2).
  it.each([
    ['repay sendiri', USER, USER],
    ['repay ETH lewat gateway', USER, GATEWAY],
    ['repay utang alamat lain', OTHER, USER],
  ] as const)('owner = user for %s', (_label, user, repayer) => {
    expect(repayRow({ reserve: WETH, user, repayer, amount: 7n })).toEqual({
      kind: 'repay',
      owner: user,
      caller: repayer,
      reserve: WETH,
      amount: 7n,
      collateralEnabled: null,
    });
  });
});

describe('withdrawRow()', () => {
  it('records the position under user, the aToken owner', () => {
    expect(withdrawRow({ reserve: USDC, user: USER, to: OTHER, amount: 3n }, undefined)).toEqual({
      kind: 'withdraw',
      owner: USER,
      caller: USER,
      reserve: USDC,
      amount: 3n,
      collateralEnabled: null,
    });
  });

  // withdrawETH: `Withdraw.user` = `to` = gateway; pemilik = pengirim `Transfer` aWETH ke gateway di tx yang sama (V2).
  it('takes the owner from the aWETH transfer to the gateway, keeping the gateway as caller', () => {
    expect(withdrawRow({ reserve: WETH, user: GATEWAY, to: GATEWAY, amount: 3n }, USER)).toMatchObject({ owner: USER, caller: GATEWAY });
  });
});

describe('collateralRow()', () => {
  it.each([true, false])('records a manual toggle (enabled = %s) under user, without an amount', (enabled) => {
    expect(collateralRow({ reserve: USDC, user: USER }, enabled)).toEqual({
      kind: 'collateral',
      owner: USER,
      caller: USER,
      reserve: USDC,
      amount: null,
      collateralEnabled: enabled,
    });
  });
});
