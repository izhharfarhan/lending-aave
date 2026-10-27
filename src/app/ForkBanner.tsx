import { IS_FORK } from '@/config/appMode';
import { SUPPORTED_CHAINS } from '@/config/chains';
import { forkBlock, forkRpcUrl } from '@/config/fork';
import { FORK } from '@/copy';

// Pita kuning-hitam, sengaja bukan warna aksen, biar fork nggak pernah ketuker sama mainnet (pola swap-web).
export function ForkBanner() {
  if (!IS_FORK) return null;

  return (
    <div role="status" className="hazard px-3 py-1.5">
      <p className="mx-auto flex w-fit flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-md bg-hazard-ink px-4 py-1 font-mono text-xs text-hazard">
        <strong className="tracking-[0.2em]">{FORK.badge}</strong>
        {SUPPORTED_CHAINS.map((c) => (
          <span key={c.chainId}>
            {c.name} #{forkBlock(c.chainId).toString()} · {forkRpcUrl(c.chainId).replace('http://', '')}
          </span>
        ))}
        <span>{FORK.note}</span>
      </p>
    </div>
  );
}
