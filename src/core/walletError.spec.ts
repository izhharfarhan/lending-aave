import { aaveErrorName, walletErrorKind } from './walletError';

// Bentuk error kayak dari wagmi/viem: dibungkus berlapis, aslinya ada di `cause`.
const wrapped = (inner: object) => Object.assign(new Error('Request failed'), { name: 'TransactionExecutionError', cause: inner });

describe('walletErrorKind()', () => {
  describe('positive', () => {
    it('recognises a wallet rejection by name or EIP-1193 code 4001, however deep', () => {
      expect(walletErrorKind(wrapped({ name: 'UserRejectedRequestError' }))).toBe('rejected');
      expect(walletErrorKind(wrapped({ name: 'RpcRequestError', code: 4001 }))).toBe('rejected');
    });

    it('recognises the wallet sitting on another chain (viem and wagmi flavours)', () => {
      expect(walletErrorKind(wrapped({ name: 'ChainMismatchError' }))).toBe('wrong_network');
      expect(walletErrorKind(wrapped({ name: 'ConnectorChainMismatchError' }))).toBe('wrong_network');
    });

    it('recognises not enough ETH to pay for gas + value', () => {
      expect(walletErrorKind(wrapped({ name: 'InsufficientFundsError' }))).toBe('insufficient_funds');
    });
  });

  describe('negative', () => {
    it('falls back to failed for anything else, including non-errors', () => {
      expect(walletErrorKind(wrapped({ name: 'ContractFunctionRevertedError' }))).toBe('failed');
      expect(walletErrorKind(new Error('boom'))).toBe('failed');
      expect(walletErrorKind('boom')).toBe('failed');
      expect(walletErrorKind(undefined)).toBe('failed');
    });
  });

  describe('edge case', () => {
    it('does not mistake a message that only mentions rejection for a real reject', () => {
      expect(walletErrorKind(new Error('User rejected the request'))).toBe('failed');
    });
  });
});

// Revert kontrak dibungkus viem: ContractFunctionExecutionError → ContractFunctionRevertedError { data: { errorName } }.
const reverted = (errorName: string) =>
  wrapped({ name: 'ContractFunctionExecutionError', cause: { name: 'ContractFunctionRevertedError', data: { errorName } } });

describe('aaveErrorName()', () => {
  describe('positive', () => {
    it('finds the decoded custom error of an Aave revert, however deep', () => {
      expect(aaveErrorName(reverted('SupplyCapExceeded'))).toBe('SupplyCapExceeded');
      expect(aaveErrorName(reverted('ReserveFrozen'))).toBe('ReserveFrozen');
    });
  });

  describe('negative', () => {
    it('returns nothing for a wallet rejection or a revert viem could not decode', () => {
      expect(aaveErrorName(wrapped({ name: 'UserRejectedRequestError' }))).toBeUndefined();
      expect(aaveErrorName(wrapped({ name: 'ContractFunctionRevertedError' }))).toBeUndefined();
      expect(aaveErrorName(undefined)).toBeUndefined();
    });
  });
});
