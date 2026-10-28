import { describe, expect, it } from 'vitest';

import { actionAbsorbs, collateralJoins, type TxSlot } from '../../src/core/collateralMerge';

// V3/Q18: event jaminan otomatis (supply pertama, saldo habis) digabung ke baris aksi di tx yang sama untuk reserve dan
// pemilik yang sama; urutan log-nya bisa jaminan dulu atau aksi dulu, dua-duanya harus berakhir di satu baris.

describe('collateralJoins(): event jaminan datang sesudah baris aksi', () => {
  it.each([
    ['supply pertama → jaminan aktif', { logIndex: 4, kind: 'supply', collateralEnabled: null }, true],
    ['withdraw semua → jaminan nonaktif', { logIndex: 4, kind: 'withdraw', collateralEnabled: null }, false],
    ['repay pakai aToken sampai habis → jaminan nonaktif', { logIndex: 4, kind: 'repay', collateralEnabled: null }, false],
  ] as const)('joins the action row for %s', (_label, slot, enabled) => {
    expect(collateralJoins(slot, enabled)).toBe(4);
  });

  it('stands alone when nothing else happened to that reserve in the tx (manual toggle)', () => {
    expect(collateralJoins(undefined, true)).toBeUndefined();
  });

  it.each([
    // Arah yang nggak mungkin otomatis untuk aksi itu = toggle manual di tx yang sama (multicall/smart wallet).
    ['supply lalu nonaktifkan manual', { logIndex: 4, kind: 'supply', collateralEnabled: null }, false],
    ['withdraw lalu aktifkan manual', { logIndex: 4, kind: 'withdraw', collateralEnabled: null }, true],
    // Borrow nggak pernah mengubah jaminan.
    ['borrow lalu toggle', { logIndex: 4, kind: 'borrow', collateralEnabled: null }, false],
    // Baris aksi sudah memuat event otomatisnya; event kedua = toggle manual.
    ['supply yang jaminannya sudah tercatat', { logIndex: 4, kind: 'supply', collateralEnabled: true }, true],
    ['toggle sebelumnya di tx yang sama', { logIndex: 4, kind: 'collateral', collateralEnabled: false }, true],
  ] as const)('stands alone for %s', (_label, slot, enabled) => {
    expect(collateralJoins(slot as TxSlot, enabled)).toBeUndefined();
  });
});

describe('actionAbsorbs(): baris aksi datang sesudah event jaminan', () => {
  it.each([
    ['supply', true],
    ['withdraw', false],
    ['repay', false],
  ] as const)('absorbs the standalone collateral row into %s', (kind, enabled) => {
    expect(actionAbsorbs({ logIndex: 2, kind: 'collateral', collateralEnabled: enabled }, kind)).toEqual({ logIndex: 2, collateralEnabled: enabled });
  });

  it('absorbs nothing without an earlier row', () => {
    expect(actionAbsorbs(undefined, 'supply')).toBeUndefined();
  });

  it.each([
    ['supply sesudah toggle nonaktif', { logIndex: 2, kind: 'collateral', collateralEnabled: false }, 'supply'],
    ['borrow sesudah toggle aktif', { logIndex: 2, kind: 'collateral', collateralEnabled: true }, 'borrow'],
    ['supply kedua sesudah supply', { logIndex: 2, kind: 'supply', collateralEnabled: true }, 'supply'],
  ] as const)('absorbs nothing for %s', (_label, slot, kind) => {
    expect(actionAbsorbs(slot as TxSlot, kind)).toBeUndefined();
  });
});
