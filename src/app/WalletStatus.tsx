'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

import { FORK_GUARD, WALLET } from '@/copy';
import { useForkGuard } from '@/wallet/useForkGuard';

export function WalletButton() {
  return <ConnectButton label={WALLET.connect} chainStatus="none" showBalance={false} accountStatus="address" />;
}

// Peringatan pengaman fork + ajakan connect (Q6). Saldo wallet tampil di tabel "Pasar supply".
export function WalletOverview({ chainId }: { chainId: number }) {
  const { isConnected } = useAccount();
  const guard = useForkGuard(chainId);

  if (guard.safe && isConnected) return null;
  return (
    <section className="surface flex flex-col gap-4 p-6">
      {!guard.safe && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {FORK_GUARD[guard.reason]}
        </p>
      )}
      {!isConnected && <p className="text-sm text-muted">{WALLET.connectPrompt}</p>}
    </section>
  );
}
