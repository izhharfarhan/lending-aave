import { checkForkGuard, type ForkGuardInput } from './forkGuard';

const PIN = 26_282_000n;
const LOCAL = 'anvilFork';

const forkInput = (overrides: Partial<ForkGuardInput> = {}): ForkGuardInput => ({
  mode: 'fork',
  connectorId: LOCAL,
  localConnectorId: LOCAL,
  pinnedForkBlock: PIN,
  rpcForkBlock: PIN,
  ...overrides,
});

describe('checkForkGuard()', () => {
  describe('positive', () => {
    it('allows the local connector on an Anvil forked at the pinned block', () => {
      expect(checkForkGuard(forkInput())).toEqual({ safe: true });
    });

    it('allows a fork with no wallet connected yet', () => {
      expect(checkForkGuard(forkInput({ connectorId: undefined }))).toEqual({ safe: true });
    });

    it('never blocks mainnet mode, whatever the wallet or RPC says', () => {
      expect(
        checkForkGuard(forkInput({ mode: 'mainnet', connectorId: 'injected', rpcForkBlock: null })),
      ).toEqual({ safe: true });
    });
  });

  describe('negative', () => {
    it('blocks a non-local connector in fork mode', () => {
      expect(checkForkGuard(forkInput({ connectorId: 'injected' }))).toEqual({
        safe: false,
        reason: 'not_local_connector',
      });
    });

    it('blocks when the RPC is not an Anvil fork', () => {
      expect(checkForkGuard(forkInput({ rpcForkBlock: null }))).toEqual({
        safe: false,
        reason: 'not_a_fork',
      });
    });

    it('blocks when Anvil was forked at a different block than the pin', () => {
      expect(checkForkGuard(forkInput({ rpcForkBlock: PIN + 1n }))).toEqual({
        safe: false,
        reason: 'fork_block_mismatch',
      });
    });
  });

  describe('edge case', () => {
    it('fails closed while the fork block is still being checked', () => {
      expect(checkForkGuard(forkInput({ rpcForkBlock: undefined }))).toEqual({
        safe: false,
        reason: 'checking',
      });
    });
  });
});
