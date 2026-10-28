import type { Address } from 'viem';
import { describe, expect, it } from 'vitest';

import { supplyRow } from '../../src/core/positionEvent';

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
// WrappedTokenGatewayV3 Ethereum: `Supply.user` untuk supply ETH.
const GATEWAY: Address = '0xd01607c3C5eCABa394D8be377a08590149325722';

describe('supplyRow()', () => {
  it('records the position under onBehalfOf, keeping the Pool caller apart', () => {
    expect(supplyRow({ reserve: USDC, user: USER, onBehalfOf: USER, amount: 1_000_000n })).toEqual({
      kind: 'supply',
      owner: USER,
      caller: USER,
      reserve: USDC,
      amount: 1_000_000n,
    });
  });

  // #11: pemilik bukan pemanggil Pool, juga bukan `tx.from`.
  it.each([
    ['supply ETH lewat gateway', GATEWAY, USER],
    ['supply atas nama akun lain', USER, OTHER],
  ] as const)('owner = onBehalfOf for %s', (_label, user, onBehalfOf) => {
    expect(supplyRow({ reserve: USDC, user, onBehalfOf, amount: 1n })).toMatchObject({ owner: onBehalfOf, caller: user });
  });
});
