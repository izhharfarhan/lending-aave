'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatEther } from 'viem';
import { useAccount, useBalance } from 'wagmi';

import { SUPPORTED_CHAINS } from '@/config/chains';
import { FORK_GUARD, WALLET } from '@/copy';
import { useForkGuard } from '@/wallet/useForkGuard';

// Tiket 01: satu chain (Ethereum). Pemilihan chain masuk di tiket 10.
const CHAIN_ID = SUPPORTED_CHAINS[0].chainId;

export function WalletButton() {
  return <ConnectButton label={WALLET.connect} chainStatus="none" showBalance={false} accountStatus="address" />;
}

// Tiket 01: bukti wallet tersambung ke fork (saldo ETH akun tes) + peringatan pengaman fork.
export function WalletOverview() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: isConnected } });
  const guard = useForkGuard(CHAIN_ID);

  return (
    <section className="surface flex flex-col gap-4 p-6">
      {!guard.safe && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {FORK_GUARD[guard.reason]}
        </p>
      )}
      {isConnected ? (
        <div>
          <p className="text-sm text-muted">{WALLET.ethBalance}</p>
          <p className="display mt-2 text-4xl font-extralight tracking-tight">
            {balance ? Number(formatEther(balance.value)).toLocaleString('id-ID', { maximumFractionDigits: 4 }) : '…'}{' '}
            <span className="text-lg text-muted">ETH</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">{WALLET.connectPrompt}</p>
      )}
    </section>
  );
}
