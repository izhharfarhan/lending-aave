import type { Address } from 'viem';

/** Jenis baris riwayat (DECISIONS Q18); satu sumber untuk enum DB dan tipe baris. Tiket 20–21 menambah sisanya. */
export const POSITION_EVENT_KINDS = ['supply'] as const;
export type PositionEventKind = (typeof POSITION_EVENT_KINDS)[number];

/** Argumen event `Supply` Pool Aave v3. `user` = pemanggil Pool (bisa WrappedTokenGateway), bukan pemilik. */
export type SupplyArgs = { reserve: Address; user: Address; onBehalfOf: Address; amount: bigint };

export type PositionRow = { kind: PositionEventKind; owner: Address; caller: Address; reserve: Address; amount: bigint };

// DECISIONS #11: pemilik posisi dari field event, bukan `tx.from`. Supply → `onBehalfOf`: supply ETH lewat gateway
// (`user` = gateway) dan supply atas nama orang lain tetap tercatat di pemilik aToken-nya. Jumlah bigint mentah.
export function supplyRow({ reserve, user, onBehalfOf, amount }: SupplyArgs): PositionRow {
  return { kind: 'supply', owner: onBehalfOf, caller: user, reserve, amount };
}
