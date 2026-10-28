import type { PositionEventKind } from './positionEvent';

/**
 * Baris `position_event` terakhir di satu tx untuk (reserve, pemilik) yang sama. Ponder cuma bisa `find` lewat primary
 * key, jadi handler menyimpannya di tabel bantu supaya event jaminan dan aksinya bisa saling menemukan.
 */
export type TxSlot = { logIndex: number; kind: PositionEventKind; collateralEnabled: boolean | null };

// V3: arah event jaminan yang terpancar otomatis oleh tiap aksi. Supply pertama mengaktifkan; withdraw, repay pakai
// aToken, dan likuidasi yang menghabiskan saldo menonaktifkan. Borrow nggak pernah mengubah jaminan. Arah lain = toggle
// manual.
const AUTOMATIC_COLLATERAL: Partial<Record<PositionEventKind, boolean>> = { supply: true, withdraw: false, repay: false, liquidation: false };

const isAutomatic = (kind: PositionEventKind, enabled: boolean) => AUTOMATIC_COLLATERAL[kind] === enabled;

/**
 * Event jaminan sesudah baris aksinya: `logIndex` baris aksi yang menyerapnya ("Supply 1 ETH · jaminan aktif"), atau
 * `undefined` kalau berdiri sendiri sebagai baris collateral (toggle manual, Q18).
 */
export function collateralJoins(slot: TxSlot | undefined, enabled: boolean): number | undefined {
  if (!slot || slot.collateralEnabled !== null || !isAutomatic(slot.kind, enabled)) return undefined;
  return slot.logIndex;
}

/**
 * Baris aksi sesudah event jaminannya: baris collateral yang harus dihapus dan dipindah ke baris aksi, atau `undefined`
 * kalau nggak ada.
 */
export function actionAbsorbs(slot: TxSlot | undefined, kind: PositionEventKind): { logIndex: number; collateralEnabled: boolean } | undefined {
  if (slot?.kind !== 'collateral' || slot.collateralEnabled === null || !isAutomatic(kind, slot.collateralEnabled)) return undefined;
  return { logIndex: slot.logIndex, collateralEnabled: slot.collateralEnabled };
}
