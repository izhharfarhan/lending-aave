'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPublicClient, createTestClient, erc20Abi, http, type Address } from 'viem';
import { useAccount, useBlock } from 'wagmi';

import { WHITELIST } from '@/config/assets';
import { AAVE } from '@/config/contracts';
import { chainName, supportedChain } from '@/config/chains';
import { ambiguousAmount, parseAmountInput } from '@/core/parseAmountInput';
import { aaveErrorName } from '@/core/walletError';
import { forkRpcUrl } from '@/config/fork';
import { DEV_TOOLS, PANEL } from '@/copy';
import { getDevTools, setDevTools, subscribeDevTools, type DevToolsFlags } from '@/devtools/devTools';
import { advanceTime, faucet, setUserEMode, TIME_STEPS, type ForkActionClients, type TimeStep } from '@/devtools/forkActions';

const REJECTS: { flag: keyof DevToolsFlags; label: string }[] = [
  { flag: 'rejectSwitchChain', label: DEV_TOOLS.rejectSwitchChain },
  { flag: 'rejectTx', label: DEV_TOOLS.rejectTx },
  { flag: 'rejectSignature', label: DEV_TOOLS.rejectSignature },
];
const STEPS = Object.keys(TIME_STEPS) as TimeStep[];
const NATIVE = 'native';

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'done' | 'error'; text: string };

// Tiket 17 (pola swap-web): simulasi reject wallet dan latency, plus maju waktu, faucet, dan kategori E-Mode di Anvil chain
// terpilih. Flag dibaca connector fork dan bacaan posisi saat request, jadi langsung terpakai. Sesudah aksi ke Anvil semua
// query dibaca ulang (posisi, saldo, blok).
export default function DevToolsPanel({ chainId }: { chainId: number }) {
  const flags = useSyncExternalStore(subscribeDevTools, getDevTools, getDevTools);
  const queryClient = useQueryClient();
  const { address } = useAccount();
  // Jam blok juga bergerak tanpa Dev Tools (tx dari panel aksi), jadi dibaca ulang berkala.
  const { data: block } = useBlock({ chainId, query: { refetchInterval: 10_000 } });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [asset, setAsset] = useState<string>(NATIVE);
  const [amount, setAmount] = useState('1000');
  const [category, setCategory] = useState('1');
  const name = chainName(chainId);
  const assets = WHITELIST[chainId];

  const clients = useMemo<ForkActionClients>(() => {
    const chain = supportedChain(chainId).viemChain;
    const transport = http(forkRpcUrl(chainId), { timeout: 120_000 });
    return { publicClient: createPublicClient({ chain, transport }), testClient: createTestClient({ chain, mode: 'anvil', transport }) };
  }, [chainId]);

  const run = async (action: () => Promise<string>) => {
    setStatus({ kind: 'working' });
    try {
      const text = await action();
      await queryClient.invalidateQueries();
      setStatus({ kind: 'done', text });
    } catch (error) {
      // Error Pool pakai namanya (mis. InvalidDebtInEmode); sisanya baris pertama pesannya.
      const message = aaveErrorName(error) ?? (error instanceof Error ? error.message.split('\n')[0] : String(error));
      setStatus({ kind: 'error', text: DEV_TOOLS.failed(message) });
    }
  };

  const advance = (step: TimeStep) =>
    run(async () => {
      await advanceTime(clients, TIME_STEPS[step]);
      return DEV_TOOLS.advanced(DEV_TOOLS.timeSteps[step]);
    });

  const fund = () =>
    run(async () => {
      const entry = assets.find((a) => (a.native ? NATIVE : a.address) === asset)!;
      const token = entry.native ? NATIVE : entry.address;
      const decimals = token === NATIVE ? 18 : await clients.publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' });
      // Aturan input sama dengan panel aksi: titik dan koma = desimal, desimal berlebih ditolak (bukan dibulatkan).
      const parsed = parseAmountInput(amount, decimals);
      if (!parsed.ok) throw new Error(DEV_TOOLS.invalidAmount(parsed.reason));
      await faucet(clients, { account: address!, asset: token, amount: parsed.value });
      return DEV_TOOLS.funded(amount.trim(), entry.symbol);
    });

  const enterEMode = () =>
    run(async () => {
      const categoryId = Number(category);
      if (!Number.isInteger(categoryId) || categoryId < 0 || categoryId > 255) throw new Error(DEV_TOOLS.invalidCategory);
      await setUserEMode(clients, { pool: AAVE[chainId].pool, account: address!, categoryId });
      return DEV_TOOLS.eModeSet(categoryId);
    });

  const busy = status.kind === 'working';
  // Sama dengan panel aksi: "1.000" dikunci sampai ditulis ulang.
  const ambiguous = ambiguousAmount(amount);
  return (
    // Desktop: kiri bawah, di atas sidebar, supaya nggak menutupi panel aksi di kanan. Mobile: kanan, di atas bar
    // Supply/Borrow (tiket 16); sheet panel aksi (z-50) menutupinya.
    <details className="surface fixed bottom-24 right-4 z-[45] w-80 max-w-[calc(100vw-2rem)] overflow-hidden text-sm md:bottom-4 md:left-4 md:right-auto">
      <summary className="hazard cursor-pointer px-3 py-1.5">
        <span className="rounded-md bg-hazard-ink px-2 py-0.5 font-mono text-xs font-bold tracking-[0.2em] text-hazard">{DEV_TOOLS.badge}</span>
      </summary>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
        <Group legend={DEV_TOOLS.rejectsLegend}>
          {REJECTS.map(({ flag, label }) => (
            <Check key={flag} label={label} checked={flags[flag]} onChange={(checked) => setDevTools({ [flag]: checked })} />
          ))}
        </Group>
        <Group legend={DEV_TOOLS.rpcLegend}>
          <Check label={DEV_TOOLS.randomLatency} checked={flags.randomLatency} onChange={(checked) => setDevTools({ randomLatency: checked })} />
        </Group>
        <Group legend={DEV_TOOLS.timeLegend(name)}>
          <div className="flex gap-2">
            {STEPS.map((step) => (
              <button key={step} type="button" className="btn-ghost flex-1 px-2 py-1.5 text-xs" disabled={busy} onClick={() => advance(step)}>
                {DEV_TOOLS.timeSteps[step]}
              </button>
            ))}
          </div>
          {block && (
            <span className="text-xs text-muted">
              {DEV_TOOLS.blockTime(new Date(Number(block.timestamp) * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }))}
            </span>
          )}
        </Group>
        <Group legend={DEV_TOOLS.faucetLegend(name)}>
          {address ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
              <select aria-label={DEV_TOOLS.faucetAsset} className="rounded-md border border-line-strong bg-panel px-2 py-1.5" value={asset} onChange={(e) => setAsset(e.target.value)}>
                {assets.map((a) => (
                  <option key={a.address} value={a.native ? NATIVE : a.address}>
                    {a.symbol}
                  </option>
                ))}
              </select>
              <input
                aria-label={DEV_TOOLS.faucetAmount}
                inputMode="decimal"
                className="num w-full rounded-md border border-line-strong bg-panel px-2 py-1.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button type="button" className="btn-accent px-3 py-1.5 text-xs" disabled={busy || ambiguous !== null} onClick={fund}>
                {DEV_TOOLS.faucetSubmit}
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted">{DEV_TOOLS.needsWallet}</span>
          )}
          {address && ambiguous && <span className="text-xs text-warn">{PANEL.ambiguous(ambiguous.asDecimal, ambiguous.asThousands)}</span>}
        </Group>
        <Group legend={DEV_TOOLS.eModeLegend(name)}>
          {address ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                aria-label={DEV_TOOLS.eModeCategory}
                inputMode="numeric"
                className="num w-full rounded-md border border-line-strong bg-panel px-2 py-1.5"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={enterEMode}>
                {DEV_TOOLS.eModeSubmit}
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted">{DEV_TOOLS.needsWallet}</span>
          )}
          <span className="text-xs text-muted">{DEV_TOOLS.eModeHint}</span>
        </Group>
        {status.kind !== 'idle' && (
          <p role="status" className={`text-xs ${status.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
            {status.kind === 'working' ? DEV_TOOLS.working : status.text}
          </p>
        )}
      </div>
    </details>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs text-muted">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" className="accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
