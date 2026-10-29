import { DEFAULT_DEV_TOOLS, type DevToolsFlags } from './devTools';
import { withDevToolsRejects } from './withDevToolsRejects';

const OFF = DEFAULT_DEV_TOOLS;

type Args = { method: string; params?: unknown };

// `request` palsu yang mencatat apa saja yang sampai ke "RPC" (pola swap-web).
const wrap = (flags: Partial<DevToolsFlags>) => {
  const reached: Args[] = [];
  const inner = async (args: Args) => {
    reached.push(args);
    return '0xresult';
  };
  return { reached, request: withDevToolsRejects(inner, () => ({ ...OFF, ...flags })) };
};

describe('withDevToolsRejects()', () => {
  describe('positive', () => {
    it.each([
      ['eth_sendTransaction', 'rejectTx'],
      ['eth_signTypedData_v4', 'rejectSignature'],
      ['wallet_switchEthereumChain', 'rejectSwitchChain'],
    ] as const)('rejects %s as the user would (code 4001) when %s is on, without reaching the RPC', async (method, flag) => {
      const { reached, request } = wrap({ [flag]: true });

      await expect(request({ method, params: [] })).rejects.toMatchObject({ name: 'UserRejectedRequestError', code: 4001 });
      expect(reached).toEqual([]);
    });
  });

  describe('negative', () => {
    it('passes every request through when all flags are off', async () => {
      const { reached, request } = wrap({});

      expect(await request({ method: 'eth_sendTransaction', params: [] })).toBe('0xresult');
      expect(reached).toEqual([{ method: 'eth_sendTransaction', params: [] }]);
    });

    it('only rejects the method its flag covers', async () => {
      const { request } = wrap({ rejectSignature: true });

      expect(await request({ method: 'eth_sendTransaction', params: [] })).toBe('0xresult');
    });
  });

  describe('edge cases', () => {
    // Baca saldo, estimasi gas, dll. nggak pernah "ditolak wallet".
    it('never rejects read methods, even with every reject flag on', async () => {
      const { request } = wrap({ rejectTx: true, rejectSignature: true, rejectSwitchChain: true });

      expect(await request({ method: 'eth_call', params: [] })).toBe('0xresult');
    });

    it('reads the flags on every request, not once when wrapped', async () => {
      let flags = OFF;
      const request = withDevToolsRejects(async (args: Args) => args.method, () => flags);

      expect(await request({ method: 'eth_sendTransaction' })).toBe('eth_sendTransaction');
      flags = { ...OFF, rejectTx: true };
      await expect(request({ method: 'eth_sendTransaction' })).rejects.toMatchObject({ code: 4001 });
    });
  });
});
