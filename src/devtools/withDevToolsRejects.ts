import { UserRejectedRequestError } from 'viem';

import { getDevTools, type DevToolsFlags } from './devTools';

// Tiga titik reject wallet yang bisa disimulasi (pola swap-web). Method lain (baca, estimasi gas) nggak pernah ditolak.
const REJECT_FLAG: Partial<Record<string, keyof DevToolsFlags>> = {
  eth_sendTransaction: 'rejectTx',
  eth_signTypedData_v4: 'rejectSignature',
  wallet_switchEthereumChain: 'rejectSwitchChain',
};

// Bungkus `request` provider connector fork: flag dibaca tiap request, jadi bisa diganti dari panel kapan saja. Error-nya
// sama dengan wallet beneran yang ditolak user (EIP-1193 code 4001), jadi `walletErrorKind` = 'rejected'. Sengaja longgar
// (`never`): `request` EIP-1193 viem diketik per method, dan pembungkus ini cuma membaca `method`.
type RequestFn = (args: never, ...rest: never[]) => Promise<unknown>;

export function withDevToolsRejects<TRequest extends RequestFn>(request: TRequest, flags = getDevTools): TRequest {
  return (async (args: { method: string }, ...rest: never[]) => {
    const flag = REJECT_FLAG[args.method];
    if (flag && flags()[flag]) throw new UserRejectedRequestError(new Error(`Dev Tools: ${args.method} ditolak`));
    return request(args as never, ...rest);
  }) as unknown as TRequest;
}
