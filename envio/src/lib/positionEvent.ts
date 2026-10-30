import type { Address } from 'viem';

/** Jenis baris riwayat (DECISIONS Q18); satu sumber untuk enum DB dan tipe baris. */
export const POSITION_EVENT_KINDS = ['supply', 'withdraw', 'borrow', 'repay', 'collateral', 'liquidation'] as const;
export type PositionEventKind = (typeof POSITION_EVENT_KINDS)[number];

// Argumen event Pool Aave v3.7 (V1). Field `user` artinya beda per event: lihat aturan pemilik di bawah.
export type SupplyArgs = { reserve: Address; user: Address; onBehalfOf: Address; amount: bigint };
export type WithdrawArgs = { reserve: Address; user: Address; to: Address; amount: bigint };
export type BorrowArgs = { reserve: Address; user: Address; onBehalfOf: Address; amount: bigint };
export type RepayArgs = { reserve: Address; user: Address; repayer: Address; amount: bigint };
export type CollateralArgs = { reserve: Address; user: Address };

export type PositionRow = {
  kind: PositionEventKind;
  owner: Address;
  caller: Address;
  reserve: Address;
  /** `null` cuma untuk baris collateral (toggle nggak punya jumlah). */
  amount: bigint | null;
  /**
   * Status jaminan yang berubah di baris ini: di baris aksi = event jaminan otomatis yang digabung (V3), di baris
   * collateral = arah toggle manual. `null` = jaminan nggak berubah.
   */
  collateralEnabled: boolean | null;
};

// DECISIONS #11: pemilik posisi dari field event, bukan `tx.from`. Jumlah bigint mentah.

/** Supply → `onBehalfOf` (supply ETH: `user` = gateway; supply atas nama alamat lain: pemilik aToken-nya). */
export function supplyRow({ reserve, user, onBehalfOf, amount }: SupplyArgs): PositionRow {
  return { kind: 'supply', owner: onBehalfOf, caller: user, reserve, amount, collateralEnabled: null };
}

/** Borrow → `onBehalfOf`, yang berutang (borrowETH: `user` = gateway). */
export function borrowRow({ reserve, user, onBehalfOf, amount }: BorrowArgs): PositionRow {
  return { kind: 'borrow', owner: onBehalfOf, caller: user, reserve, amount, collateralEnabled: null };
}

/** Repay → `user`, yang utangnya berkurang (repayETH: `repayer` = gateway). */
export function repayRow({ reserve, user, repayer, amount }: RepayArgs): PositionRow {
  return { kind: 'repay', owner: user, caller: repayer, reserve, amount, collateralEnabled: null };
}

/**
 * Withdraw → `user`, pemilik aToken. Pengecualian withdrawETH (V2): `user` = gateway, jadi pemiliknya pengirim
 * `Transfer` aWETH ke gateway di tx yang sama (`gatewayTransferFrom`, dicari handler kalau `user` = gateway).
 */
export function withdrawRow({ reserve, user, amount }: WithdrawArgs, gatewayTransferFrom: Address | undefined): PositionRow {
  return { kind: 'withdraw', owner: gatewayTransferFrom ?? user, caller: user, reserve, amount, collateralEnabled: null };
}

/** `ReserveUsedAsCollateralEnabled/Disabled` → `user`. */
export function collateralRow({ reserve, user }: CollateralArgs, enabled: boolean): PositionRow {
  return { kind: 'collateral', owner: user, caller: user, reserve, amount: null, collateralEnabled: enabled };
}
