import { decodeEventLog, isAddressEqual, parseAbi, type Address, type Hex } from 'viem';

import { PoolAbi } from '../../abis/PoolAbi';
import type { PositionRow } from './positionEvent';

/** Argumen event `LiquidationCall` Pool Aave v3.7 (V1). */
export type LiquidationArgs = {
  collateralAsset: Address;
  debtAsset: Address;
  user: Address;
  debtToCover: bigint;
  liquidatedCollateralAmount: bigint;
  liquidator: Address;
  receiveAToken: boolean;
};

/**
 * Baris riwayat likuidasi: pemilik = `user` (#11), pemanggil = likuidator. `amount` = jaminan yang hilang (V5, Q16):
 * `liquidatedCollateralAmount` (bagian likuidator saja) + protocol fee dari `Transfer` aToken ke treasury.
 */
export function liquidationRow({ collateralAsset, user, liquidatedCollateralAmount, liquidator }: LiquidationArgs, protocolFee: bigint): PositionRow {
  return { kind: 'liquidation', owner: user, caller: liquidator, reserve: collateralAsset, amount: liquidatedCollateralAmount + protocolFee, collateralEnabled: null };
}

/** Kategori E-Mode user saat likuidasi (getter Pool v3.7, DECISIONS V4 "Keputusan tiket 14"). */
export type LiquidationEMode = { categoryId: number; liquidationBonus: number; collateralBitmap: bigint };

const BPS = 10_000n;
// `ReserveConfigurationMap`: bonus likuidasi di bit 32–47 (basis poin, 10.500 = 105%).
const reserveBonus = (configuration: bigint) => Number((configuration >> 32n) & 0xffffn);
const onBitmap = (bitmap: bigint, id: number) => ((bitmap >> BigInt(id)) & 1n) === 1n;

/**
 * Bonus yang dipakai Pool (V5, `LiquidationLogic`): bonus kategori E-Mode kalau user di E-Mode dan aset jaminannya ada
 * di `collateralBitmap` kategori itu (bit = id reserve); selain itu bonus reserve. `eMode` = null kalau user di luar
 * E-Mode.
 */
export function appliedLiquidationBonus({
  reserveConfiguration,
  collateralReserveId,
  eMode,
}: {
  reserveConfiguration: bigint;
  collateralReserveId: number;
  eMode: LiquidationEMode | null;
}): { bonus: number; fromEMode: boolean } {
  if (eMode && onBitmap(eMode.collateralBitmap, collateralReserveId)) return { bonus: eMode.liquidationBonus, fromEMode: true };
  return { bonus: reserveBonus(reserveConfiguration), fromEMode: false };
}

/**
 * Penalti dalam token jaminan (Q16, V5): total − total/bonus, dengan total = jaminan yang hilang (bagian likuidator +
 * protocol fee). total/bonus dibulatkan ke bawah, jadi penaltinya bulat ke atas (paling banyak 1 unit terkecil).
 */
export function liquidationPenalty(collateralLost: bigint, bonus: number): bigint {
  return collateralLost - (collateralLost * BPS) / BigInt(bonus);
}

/** Log receipt tx likuidasi (bentuk log viem). */
export type ReceiptLog = { address: Address; topics: [Hex, ...Hex[]] | []; data: Hex; logIndex: number };

// `LiquidationCall` dari ABI yang di-index; `DeficitCreated` dan `Transfer` aToken cuma dibaca dari receipt.
const receiptAbi = [
  ...PoolAbi.filter((item) => item.name === 'LiquidationCall'),
  ...parseAbi(['event DeficitCreated(address indexed user, address indexed debtAsset, uint256 amountCreated)', 'event Transfer(address indexed from, address indexed to, uint256 value)']),
];

function decode(log: ReceiptLog) {
  try {
    return decodeEventLog({ abi: receiptAbi, topics: log.topics, data: log.data, strict: true });
  } catch {
    return undefined;
  }
}

/** Sisa utang yang dihapus untuk satu aset utang (`DeficitCreated`). */
export type Deficit = { debtAsset: Address; amount: bigint };
export type FeeAndDeficits = { protocolFee: bigint; deficits: Deficit[] };

/**
 * Protocol fee dan sisa utang yang dihapus untuk satu `LiquidationCall` (V5), dari log receipt tx-nya. Di v3.7 keduanya
 * terpancar sebelum `LiquidationCall` (dicek di fork), jadi yang dipakai cuma log sesudah `LiquidationCall` Pool
 * sebelumnya di tx yang sama (bot bisa melikuidasi beberapa posisi sekaligus).
 * - Fee = `Transfer` aToken jaminan dari user ke treasury. `Transfer` dari 0x0 ke treasury = akrual treasury, bukan fee.
 * - Deficit = semua `DeficitCreated` user itu (satu per aset utang yang dihapus).
 */
export function liquidationFeeAndDeficits(
  logs: ReceiptLog[],
  { pool, treasury, collateralAToken, user, logIndex }: { pool: Address; treasury: Address; collateralAToken: Address; user: Address; logIndex: number },
): FeeAndDeficits {
  const earlierLogs = logs.filter((log) => log.logIndex < logIndex).sort((a, b) => a.logIndex - b.logIndex);
  // Mulai sesudah `LiquidationCall` Pool terakhir sebelum yang ini.
  let start = 0;
  earlierLogs.forEach((log, i) => {
    if (isAddressEqual(log.address, pool) && decode(log)?.eventName === 'LiquidationCall') start = i + 1;
  });
  let protocolFee = 0n;
  const deficits: Deficit[] = [];
  for (const log of earlierLogs.slice(start)) {
    const event = decode(log);
    if (event?.eventName === 'Transfer' && isAddressEqual(log.address, collateralAToken)) {
      const { from, to, value } = event.args;
      if (isAddressEqual(from, user) && isAddressEqual(to, treasury)) protocolFee += value;
    } else if (event?.eventName === 'DeficitCreated' && isAddressEqual(log.address, pool) && isAddressEqual(event.args.user, user)) {
      deficits.push({ debtAsset: event.args.debtAsset, amount: event.args.amountCreated });
    }
  }
  return { protocolFee, deficits };
}

/** Bacaan chain untuk satu likuidasi: konfigurasi reserve jaminan, kategori E-Mode user, harga, dan HF blok −1. */
export type LiquidationReads = {
  reserveConfiguration: bigint;
  collateralReserveId: number;
  eMode: LiquidationEMode | null;
  collateralPrice: bigint;
  healthFactorBefore: bigint | null;
  debtRemaining: bigint;
};

/** Rincian likuidasi (tabel `liquidation`, tanpa kunci & waktu): penalti dihitung dari jaminan yang hilang. */
export function liquidationDetail(args: LiquidationArgs, { protocolFee, deficits }: FeeAndDeficits, reads: LiquidationReads) {
  const { bonus, fromEMode } = appliedLiquidationBonus(reads);
  return {
    owner: args.user,
    liquidator: args.liquidator,
    collateralAsset: args.collateralAsset,
    debtAsset: args.debtAsset,
    debtToCover: args.debtToCover,
    liquidatedCollateralAmount: args.liquidatedCollateralAmount,
    protocolFee,
    receiveAToken: args.receiveAToken,
    liquidationBonus: bonus,
    bonusFromEMode: fromEMode,
    eModeCategory: reads.eMode?.categoryId ?? 0,
    penalty: liquidationPenalty(args.liquidatedCollateralAmount + protocolFee, bonus),
    collateralPrice: reads.collateralPrice,
    healthFactorBefore: reads.healthFactorBefore,
    debtRemaining: reads.debtRemaining,
    deficitAssets: deficits.map((deficit) => deficit.debtAsset),
    deficitAmounts: deficits.map((deficit) => deficit.amount),
  };
}
