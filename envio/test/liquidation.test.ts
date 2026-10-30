import { encodeAbiParameters, encodeEventTopics, parseAbi, zeroAddress, type Address, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';

import { actionAbsorbs, collateralJoins } from '../src/lib/collateralMerge';
import { PoolAbi } from '../abis/PoolAbi';
import { appliedLiquidationBonus, liquidationDetail, liquidationFeeAndDeficits, liquidationPenalty, liquidationRow, type ReceiptLog } from '../src/lib/liquidation';

const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const LIQUIDATOR: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

// Angka dari likuidasi nyata di fork Ethereum (10 ETH / 15.000 USDC, ETH $1.800).
const args = {
  collateralAsset: WETH,
  debtAsset: USDC,
  user: USER,
  debtToCover: 15_000_000_107n,
  liquidatedCollateralAmount: 8_664_903_148_476_308_683n,
  liquidator: LIQUIDATOR,
  receiveAToken: false,
};

describe('liquidationRow()', () => {
  // #11: pemilik = `LiquidationCall.user`, bukan likuidator yang mengirim tx. V5/Q16: jaminan yang hilang = bagian
  // likuidator + protocol fee.
  it('records the collateral lost by the user, liquidator share plus protocol fee', () => {
    expect(liquidationRow(args, 83_316_376_427_656_815n)).toEqual({
      kind: 'liquidation',
      owner: USER,
      caller: LIQUIDATOR,
      reserve: WETH,
      amount: 8_748_219_524_903_965_498n,
      collateralEnabled: null,
    });
  });

  it('counts only the liquidator share when there is no protocol fee', () => {
    expect(liquidationRow(args, 0n).amount).toBe(args.liquidatedCollateralAmount);
  });
});

// V3/Q18: likuidasi yang menghabiskan jaminan memancarkan `ReserveUsedAsCollateralDisabled` otomatis (sebelum
// `LiquidationCall`, dicek di fork); digabung ke baris likuidasi.
describe('collateral merge for liquidations', () => {
  it('absorbs the automatic collateral disable emitted before the liquidation', () => {
    expect(actionAbsorbs({ logIndex: 0, kind: 'collateral', collateralEnabled: false }, 'liquidation')).toEqual({ logIndex: 0, collateralEnabled: false });
  });

  it('joins a collateral disable that comes after the liquidation row', () => {
    expect(collateralJoins({ logIndex: 12, kind: 'liquidation', collateralEnabled: null }, false)).toBe(12);
  });

  it('never absorbs a collateral enable', () => {
    expect(actionAbsorbs({ logIndex: 0, kind: 'collateral', collateralEnabled: true }, 'liquidation')).toBeUndefined();
  });
});

// Konfigurasi reserve WETH Ethereum di blok pin: LTV 80,5%, LT 83%, bonus 105% (bit 32–47), plus bit lain yang harus
// diabaikan (desimal 18 di bit 48–55, flag aktif).
const WETH_CONFIGURATION = (1n << 56n) | (18n << 48n) | (10_500n << 32n) | (8_300n << 16n) | 8_050n;

describe('appliedLiquidationBonus()', () => {
  // V5: bonus kategori E-Mode kalau user di E-Mode dan aset jaminannya di `collateralBitmap`; selain itu bonus reserve.
  it('uses the reserve bonus outside E-Mode', () => {
    expect(appliedLiquidationBonus({ reserveConfiguration: WETH_CONFIGURATION, collateralReserveId: 0, eMode: null })).toEqual({ bonus: 10_500, fromEMode: false });
  });

  it('uses the E-Mode category bonus when the collateral is in its collateral bitmap', () => {
    const eMode = { categoryId: 1, liquidationBonus: 10_100, collateralBitmap: 0b1001n };
    expect(appliedLiquidationBonus({ reserveConfiguration: WETH_CONFIGURATION, collateralReserveId: 3, eMode })).toEqual({ bonus: 10_100, fromEMode: true });
  });

  it('falls back to the reserve bonus when the collateral is outside the category bitmap', () => {
    const eMode = { categoryId: 1, liquidationBonus: 10_100, collateralBitmap: 0b1001n };
    expect(appliedLiquidationBonus({ reserveConfiguration: WETH_CONFIGURATION, collateralReserveId: 2, eMode })).toEqual({ bonus: 10_500, fromEMode: false });
  });
});

describe('liquidationPenalty()', () => {
  // Q16/V5: penalti = total − total/bonus (bonus dalam basis poin, 10.500 = 105%), total = bagian likuidator + fee.
  it.each([
    ['likuidasi 10 ETH / 15.000 USDC', 8_748_219_524_903_965_498n, 416_581_882_138_284_072n],
    ['likuidasi habis 1 ETH / 1.400 USDC', 2_000_000_004_111_875_420n, 95_238_095_433_898_830n],
  ])('takes the bonus share out of the collateral lost (%s)', (_label, total, penalty) => {
    expect(liquidationPenalty(total, 10_500)).toBe(penalty);
  });

  it('is zero without a bonus', () => {
    expect(liquidationPenalty(1_000n, 10_000)).toBe(0n);
  });
});

// Log receipt dibentuk ulang dari likuidasi nyata di fork Ethereum (urutan log v3.7: jaminan nonaktif, burn utang,
// DeficitCreated, burn jaminan, fee ke treasury, LiquidationCall paling akhir).
const POOL: Address = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const A_WETH: Address = '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8';
const A_USDC: Address = '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c';
const TREASURY: Address = '0x464C71f6c2F760DdA6093dCB91C24c39e5d6e18c';
const OTHER_USER: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const eventsAbi = [
  ...PoolAbi.filter((item) => item.name === 'LiquidationCall'),
  ...parseAbi(['event DeficitCreated(address indexed user, address indexed debtAsset, uint256 amountCreated)', 'event Transfer(address indexed from, address indexed to, uint256 value)']),
];
let nextIndex = 0;
type EventName = (typeof eventsAbi)[number]['name'];
// Topik dari argumen indexed, data dari sisanya (urutan ABI).
function log(address: Address, eventName: EventName, values: Record<string, unknown>): ReceiptLog {
  const event = eventsAbi.find((item) => item.name === eventName)!;
  const topics = encodeEventTopics({ abi: eventsAbi, eventName, args: values } as never) as [Hex, ...Hex[]];
  const data = event.inputs.filter((input) => !('indexed' in input && input.indexed));
  return { address, topics, data: encodeAbiParameters(data, data.map((input) => values[input.name!]) as never), logIndex: nextIndex++ };
}
const transfer = (token: Address, from: Address, to: Address, value: bigint) => log(token, 'Transfer', { from, to, value });
const deficit = (user: Address, debtAsset: Address, amountCreated: bigint) => log(POOL, 'DeficitCreated', { user, debtAsset, amountCreated });
const liquidationCall = (user: Address) => log(POOL, 'LiquidationCall', { ...args, user, debtToCover: 1n, liquidatedCollateralAmount: 1n });
const partsAt = (logs: ReceiptLog[], user: Address, liquidation: ReceiptLog) =>
  liquidationFeeAndDeficits(logs, { pool: POOL, treasury: TREASURY, collateralAToken: A_WETH, user, logIndex: liquidation.logIndex });

describe('liquidationFeeAndDeficits()', () => {
  it('takes the protocol fee from the collateral aToken transfer user → treasury, ignoring treasury mints', () => {
    nextIndex = 0;
    const logs = [
      transfer(A_WETH, USER, zeroAddress, 8_664_903_148_476_308_684n),
      // Akrual treasury (mint dari 0x0) di tx yang sama, bukan fee.
      transfer(A_WETH, zeroAddress, TREASURY, 2_024_100_277_637_665n),
      transfer(A_WETH, USER, TREASURY, 83_316_376_427_656_815n),
      transfer(USDC, LIQUIDATOR, A_USDC, 15_000_000_107n),
    ];
    const liquidation = liquidationCall(USER);

    expect(partsAt([...logs, liquidation], USER, liquidation)).toEqual({ protocolFee: 83_316_376_427_656_815n, deficits: [] });
  });

  // V5: `DeficitCreated` = sisa utang yang dihapus, bisa lebih dari satu aset utang.
  it('collects every deficit of the user', () => {
    nextIndex = 0;
    const logs = [deficit(USER, USDC, 704_335_473n), deficit(USER, WETH, 5n), transfer(A_WETH, USER, TREASURY, 19_047_619_086_779_765n)];
    const liquidation = liquidationCall(USER);

    expect(partsAt([...logs, liquidation], USER, liquidation)).toEqual({
      protocolFee: 19_047_619_086_779_765n,
      deficits: [
        { debtAsset: USDC, amount: 704_335_473n },
        { debtAsset: WETH, amount: 5n },
      ],
    });
  });

  it('reports no fee when nothing went to the treasury', () => {
    nextIndex = 0;
    const liquidation = liquidationCall(USER);
    expect(partsAt([transfer(A_WETH, USER, zeroAddress, 1n), liquidation], USER, liquidation)).toEqual({ protocolFee: 0n, deficits: [] });
  });

  // Bot likuidasi bisa melikuidasi beberapa posisi dalam satu tx: tiap likuidasi cuma memakai log sesudah
  // `LiquidationCall` sebelumnya.
  it('keeps the parts of several liquidations in one tx apart', () => {
    nextIndex = 0;
    const first = [transfer(A_WETH, USER, TREASURY, 10n), deficit(USER, USDC, 7n)];
    const firstCall = liquidationCall(USER);
    const second = [transfer(A_WETH, OTHER_USER, TREASURY, 20n), transfer(A_WETH, USER, TREASURY, 30n)];
    const secondCall = liquidationCall(USER);
    const logs = [...first, firstCall, ...second, secondCall];

    expect(partsAt(logs, USER, firstCall)).toEqual({ protocolFee: 10n, deficits: [{ debtAsset: USDC, amount: 7n }] });
    expect(partsAt(logs, USER, secondCall)).toEqual({ protocolFee: 30n, deficits: [] });
  });

  it('ignores fees and deficits of other users and other aTokens', () => {
    nextIndex = 0;
    const logs = [transfer(A_USDC, USER, TREASURY, 1n), transfer(A_WETH, OTHER_USER, TREASURY, 2n), deficit(OTHER_USER, USDC, 3n)];
    const liquidation = liquidationCall(USER);
    expect(partsAt([...logs, liquidation], USER, liquidation)).toEqual({ protocolFee: 0n, deficits: [] });
  });
});

describe('liquidationDetail()', () => {
  const reads = { reserveConfiguration: WETH_CONFIGURATION, collateralReserveId: 0, eMode: null, collateralPrice: 180_000_000_000n, healthFactorBefore: 996_202_712_199_390_900n, debtRemaining: 7_500_000_002n };

  it('assembles the liquidation details from the event, the receipt, and the chain reads', () => {
    expect(liquidationDetail(args, { protocolFee: 83_316_376_427_656_815n, deficits: [] }, reads)).toEqual({
      owner: USER,
      liquidator: LIQUIDATOR,
      collateralAsset: WETH,
      debtAsset: USDC,
      debtToCover: 15_000_000_107n,
      liquidatedCollateralAmount: 8_664_903_148_476_308_683n,
      protocolFee: 83_316_376_427_656_815n,
      receiveAToken: false,
      liquidationBonus: 10_500,
      bonusFromEMode: false,
      eModeCategory: 0,
      // Penalti dari jaminan yang hilang (bagian likuidator + fee), bukan dari bagian likuidator saja.
      penalty: 416_581_882_138_284_072n,
      collateralPrice: 180_000_000_000n,
      healthFactorBefore: 996_202_712_199_390_900n,
      debtRemaining: 7_500_000_002n,
      deficitAssets: [],
      deficitAmounts: [],
    });
  });

  it('pairs the deficits by index and keeps an unavailable health factor', () => {
    const deficits = [
      { debtAsset: USDC, amount: 704_335_473n },
      { debtAsset: WETH, amount: 5n },
    ];
    expect(liquidationDetail(args, { protocolFee: 0n, deficits }, { ...reads, healthFactorBefore: null })).toMatchObject({
      deficitAssets: [USDC, WETH],
      deficitAmounts: [704_335_473n, 5n],
      healthFactorBefore: null,
    });
  });

  it('records the E-Mode category of the user, also when its bonus does not apply', () => {
    const eMode = { categoryId: 1, liquidationBonus: 10_100, collateralBitmap: 0b10n };
    expect(liquidationDetail(args, { protocolFee: 0n, deficits: [] }, { ...reads, eMode })).toMatchObject({ eModeCategory: 1, liquidationBonus: 10_500, bonusFromEMode: false });
  });
});
