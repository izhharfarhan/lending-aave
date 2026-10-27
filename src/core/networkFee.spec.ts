import { networkFee, plannedGas, STEP_GAS, TYPICAL_ACTION_GAS, typicalActionFee } from './networkFee';

const GWEI = (n: number) => BigInt(n) * 10n ** 9n;

describe('networkFee()', () => {
  it('prices every remaining transaction at baseFee + priority fee', () => {
    // Approve 55.558 gas + supply 201.989 gas, baseFee 10 gwei + priority 1 gwei.
    expect(networkFee({ chainId: 1, txs: [{ gas: 55_558n }, { gas: 201_989n }], baseFeePerGas: GWEI(10), maxPriorityFeePerGas: GWEI(1) })).toBe(
      2_833_017_000_000_000n,
    );
  });

  it('adds the L1 fee of every transaction on an OP Stack chain (Base)', () => {
    const txs = [
      { gas: 100_000n, l1Fee: 7_000n },
      { gas: 50_000n, l1Fee: 3_000n },
    ];
    expect(networkFee({ chainId: 8453, txs, baseFeePerGas: 5n, maxPriorityFeePerGas: 1n })).toBe(900_000n + 10_000n);
  });

  it('refuses a missing L1 fee on Base, or one on a chain without it (Arbitrum keeps L1 inside gas)', () => {
    expect(() => networkFee({ chainId: 8453, txs: [{ gas: 1n }], baseFeePerGas: 1n, maxPriorityFeePerGas: 0n })).toThrow('L1 fee');
    expect(() => networkFee({ chainId: 42161, txs: [{ gas: 1n, l1Fee: 1n }], baseFeePerGas: 1n, maxPriorityFeePerGas: 0n })).toThrow('L1 fee');
  });

  it('is 0 when nothing is left to send', () => {
    expect(networkFee({ chainId: 1, txs: [], baseFeePerGas: GWEI(10), maxPriorityFeePerGas: GWEI(1) })).toBe(0n);
  });
});

describe('plannedGas()', () => {
  it('uses the real estimate for the next transaction and the calibrated gas for the ones after it', () => {
    // Transaksi utama baru bisa diestimasi sesudah izinnya ada (sebelumnya revert).
    expect(plannedGas(['approve', 'supply'], 55_000n)).toEqual([55_000n, STEP_GAS.supply]);
    expect(plannedGas(['resetApproval', 'approve', 'repay'], 30_000n)).toEqual([30_000n, STEP_GAS.approve, STEP_GAS.repay]);
    expect(plannedGas(['borrow'], 280_000n)).toEqual([280_000n]);
  });
});

describe('typicalActionFee()', () => {
  it('is the gas price times the gas of a typical Aave action, for the chain card badge', () => {
    expect(typicalActionFee(GWEI(2))).toBe(GWEI(2) * TYPICAL_ACTION_GAS);
  });
});
