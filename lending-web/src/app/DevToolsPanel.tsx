'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPublicClient, createTestClient, erc20Abi, http, type Address } from 'viem';
import { useAccount, useBlock } from 'wagmi';

import { useChainView } from '@/aave/useChainView';
import { WHITELIST } from '@/config/assets';
import { AAVE } from '@/config/contracts';
import { chainName, supportedChain } from '@/config/chains';
import { forkRpcUrl, TEST_ACCOUNTS } from '@/config/fork';
import { ambiguousAmount, parseAmountInput } from '@/core/parseAmountInput';
import { aaveErrorName } from '@/core/walletError';
import { DEV_TOOLS, PANEL } from '@/copy';
import { getDevTools, setDevTools, subscribeDevTools, type DevToolsFlags } from '@/devtools/devTools';
import {
  advanceTime,
  faucet,
  liquidate,
  resetOraclePrice,
  setOraclePrice,
  setUserEMode,
  TIME_STEPS,
  type ForkActionClients,
  type TimeStep,
} from '@/devtools/forkActions';
import { hf, price } from './format';

const REJECTS: { flag: keyof DevToolsFlags; label: string }[] = [
  { flag: 'rejectSwitchChain', label: DEV_TOOLS.rejectSwitchChain },
  { flag: 'rejectTx', label: DEV_TOOLS.rejectTx },
  { flag: 'rejectSignature', label: DEV_TOOLS.rejectSignature },
];
const STEPS = Object.keys(TIME_STEPS) as TimeStep[];
const NATIVE = 'native';

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'done' | 'error'; text: string };
/** Jalankan aksi ke Anvil; teks hasilnya jadi status panel. */
type Run = (action: () => Promise<string>) => Promise<void>;
/** Harga oracle Aave: USD 8 desimal. */
const ORACLE_DECIMALS = 8;

// Tiket 17 (pola swap-web): simulasi reject wallet dan latency, plus maju waktu, faucet, dan kategori E-Mode di Anvil chain
// terpilih. Tiket 18: harga oracle dan likuidasi. Flag dibaca connector fork dan bacaan posisi saat request, jadi langsung terpakai. Sesudah aksi ke Anvil semua
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
  // Pilihan aset bisa milik chain sebelumnya (panel nggak dipasang ulang saat ganti chain): kembali ke aset pertama.
  const faucetEntry = assets.find((a) => (a.native ? NATIVE : a.address) === asset) ?? assets[0];

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
      const entry = faucetEntry;
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
    // Supply/Borrow (tiket 16); sheet panel aksi (z-50) menutupinya. Di mobile, selama tertutup cuma pil selebar
    // badge-nya, bukan strip 320 px yang menutupi baris tabel; halaman fork memberi ruang di bawah (`FORK_PAGE_BOTTOM`).
    <details className="surface fixed bottom-24 right-4 z-[45] max-w-[calc(100vw-2rem)] overflow-hidden text-sm open:w-80 md:bottom-4 md:left-4 md:right-auto md:w-80">
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
              <select
                aria-label={DEV_TOOLS.faucetAsset}
                className="rounded-md border border-line-strong bg-panel px-2 py-1.5"
                value={faucetEntry.native ? NATIVE : faucetEntry.address}
                onChange={(e) => setAsset(e.target.value)}
              >
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
        <OracleGroup chainId={chainId} clients={clients} run={run} busy={busy} />
        <LiquidationGroup chainId={chainId} clients={clients} run={run} busy={busy} />
        {status.kind !== 'idle' && (
          <p role="status" className={`text-xs ${status.kind === 'error' ? 'text-danger' : 'text-muted'}`}>
            {status.kind === 'working' ? DEV_TOOLS.working : status.text}
          </p>
        )}
      </div>
    </details>
  );
}

type ActionGroupProps = { chainId: number; clients: ForkActionClients; run: Run; busy: boolean };

// Tiket 18 (V7): harga aset di oracle Aave fork lewat mock aggregator, untuk melihat HF, tier #9, harga likuidasi, dan
// banner Bahaya berubah. "Harga asli" mengembalikan sumber asli aset itu.
function OracleGroup({ chainId, clients, run, busy }: ActionGroupProps) {
  const { data } = useChainView(chainId);
  const assets = WHITELIST[chainId];
  const [picked, setPicked] = useState<Address>(assets[0].address);
  const [priceText, setPriceText] = useState('');
  // Seperti faucet: pilihan dari chain sebelumnya kembali ke aset pertama chain ini.
  const entry = assets.find((a) => a.address === picked) ?? assets[0];
  const asset = entry.address;
  const reserve = data?.read.reserves.find((r) => r.underlyingAsset.toLowerCase() === asset.toLowerCase());
  const target = { oracle: AAVE[chainId].oracle, admin: AAVE[chainId].aclAdmin, asset };
  const ambiguous = ambiguousAmount(priceText);

  const applyPrice = () =>
    run(async () => {
      const parsed = parseAmountInput(priceText, ORACLE_DECIMALS);
      if (!parsed.ok) throw new Error(DEV_TOOLS.invalidAmount(parsed.reason));
      await setOraclePrice(clients, { ...target, price: parsed.value });
      return DEV_TOOLS.priceSet(entry.symbol, price(Number(parsed.value) / 10 ** ORACLE_DECIMALS));
    });
  const resetPrice = () =>
    run(async () => {
      await resetOraclePrice(clients, target);
      return DEV_TOOLS.priceReset(entry.symbol);
    });

  return (
    <Group legend={DEV_TOOLS.oracleLegend(chainName(chainId))}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
        <select aria-label={DEV_TOOLS.oracleAsset} className="rounded-md border border-line-strong bg-panel px-2 py-1.5" value={asset} onChange={(e) => setPicked(e.target.value as Address)}>
          {assets.map((a) => (
            <option key={a.address} value={a.address}>
              {a.symbol}
            </option>
          ))}
        </select>
        <input
          aria-label={DEV_TOOLS.oraclePrice}
          inputMode="decimal"
          placeholder={DEV_TOOLS.oraclePlaceholder}
          className="num w-full rounded-md border border-line-strong bg-panel px-2 py-1.5"
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
        />
        <button type="button" className="btn-accent px-3 py-1.5 text-xs" disabled={busy || ambiguous !== null || priceText.trim() === ''} onClick={applyPrice}>
          {DEV_TOOLS.oracleSubmit}
        </button>
      </div>
      {ambiguous && <span className="text-xs text-warn">{PANEL.ambiguous(ambiguous.asDecimal, ambiguous.asThousands)}</span>}
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        {reserve && <span>{DEV_TOOLS.oracleNow(price(Number(reserve.priceInMarketReferenceCurrency) / 10 ** ORACLE_DECIMALS))}</span>}
        <button type="button" className="link" disabled={busy} onClick={resetPrice}>
          {DEV_TOOLS.oracleReset}
        </button>
      </div>
    </Group>
  );
}

// Tiket 18 (spec story 121): akun likuidator (akun tes kedua, sudah dibersihkan dari 7702) melikuidasi posisi akun yang
// tersambung, yaitu posisi yang angkanya tampil di sini. Cuma bisa saat HF < 1, sama dengan Pool; turunkan harga jaminan
// dulu lewat grup oracle.
function LiquidationGroup({ chainId, clients, run, busy }: ActionGroupProps) {
  const { address } = useAccount();
  const { data } = useChainView(chainId);
  const account = data?.view.account;
  const collaterals = data?.view.supplies.filter((s) => s.collateral) ?? [];
  const debts = data?.view.borrows ?? [];
  const [collateral, setCollateral] = useState<Address | undefined>(undefined);
  const [debt, setDebt] = useState<Address | undefined>(undefined);
  const chosenCollateral = collaterals.find((s) => s.asset === collateral) ?? collaterals[0];
  const chosenDebt = debts.find((b) => b.asset === debt) ?? debts[0];
  const healthFactor = account?.healthFactor ?? null;
  const liquidatable = healthFactor !== null && healthFactor < 1 && chosenCollateral && chosenDebt;

  const liquidatePosition = () =>
    run(async () => {
      await liquidate(clients, {
        pool: AAVE[chainId].pool,
        liquidator: TEST_ACCOUNTS.liquidator,
        user: address!,
        collateral: chosenCollateral!.asset,
        debt: chosenDebt!.asset,
        debtAmount: chosenDebt!.amount,
      });
      return DEV_TOOLS.liquidated(chosenDebt!.symbol, chosenCollateral!.symbol);
    });

  if (!account || !address) return null;
  const assetSelect = (label: string, value: Address | undefined, rows: { asset: Address; symbol: string }[], onChange: (a: Address) => void) => (
    <select aria-label={label} className="min-w-0 rounded-md border border-line-strong bg-panel px-2 py-1.5" value={value} onChange={(e) => onChange(e.target.value as Address)}>
      {rows.map((r) => (
        <option key={r.asset} value={r.asset}>
          {r.symbol}
        </option>
      ))}
    </select>
  );
  return (
    <Group legend={DEV_TOOLS.liquidationLegend(chainName(chainId))}>
      {chosenDebt && chosenCollateral ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          {assetSelect(DEV_TOOLS.liquidationCollateral, chosenCollateral.asset, collaterals, setCollateral)}
          {assetSelect(DEV_TOOLS.liquidationDebt, chosenDebt.asset, debts, setDebt)}
          <button type="button" className="btn-accent px-3 py-1.5 text-xs" disabled={busy || !liquidatable} onClick={liquidatePosition}>
            {DEV_TOOLS.liquidationSubmit}
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted">{DEV_TOOLS.liquidationNoDebt}</span>
      )}
      {healthFactor !== null && (
        <span className="text-xs text-muted">{healthFactor < 1 ? DEV_TOOLS.liquidationReady(hf(healthFactor)) : DEV_TOOLS.liquidationNotYet(hf(healthFactor))}</span>
      )}
    </Group>
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
