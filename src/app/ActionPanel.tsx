'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useState } from 'react';
import { formatUnits, type Address, type Hash } from 'viem';
import { useAccount } from 'wagmi';

import { isWalletStep, plannedSteps, useSupplyTx, type TxState } from '@/aave/useSupplyTx';
import { IS_FORK } from '@/config/appMode';
import { AAVE } from '@/config/contracts';
import { explorerAddressUrl, explorerTxUrl, revokeCashUrl } from '@/config/explorer';
import type { ChainView, SupplyMarketRow } from '@/core/chainPosition';
import { nextStep, type NextStep, type NextStepInput, type WalletStepName } from '@/core/nextStep';
import { parseAmountInput } from '@/core/parseAmountInput';
import { APPROVAL, CTA, PANEL, STEPS, TX, TX_ERROR } from '@/copy';
import { useForkGuard } from '@/wallet/useForkGuard';
import { pct, tokenAmount, usd } from './format';
import { TokenIcon } from './TokenIcon';

const SMART_ACCOUNT_NOTE_KEY = 'lending-web:smartAccountNoteDismissed';
const TABS = ['supply', 'withdraw', 'borrow', 'repay'] as const;

type Props = {
  chainId: number;
  /** Aset ERC20 yang bisa di-supply lewat panel ini (ETH lewat gateway di tiket 06). */
  assets: SupplyMarketRow[];
  asset: Address;
  onAssetChange: (asset: Address) => void;
  /** Baca ulang posisi; melempar kalau gagal, jangan kembalikan data lama. */
  refetch: () => Promise<ChainView>;
};

// Panel aksi di samping detail chain (Q20). Tiket 03: tab Supply untuk ERC20; tab lain menyusul. Panel cuma dirender
// sesudah data posisi siap (sebelumnya skeleton / "gagal dimuat" di detail chain), jadi `data` selalu `ready` di sini.
export function ActionPanel({ chainId, assets, asset, onAssetChange, refetch }: Props) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const guard = useForkGuard(chainId);
  const [amountText, setAmountText] = useState('');
  const [approvalMode, setApprovalMode] = useState<NextStepInput['approvalMode']>('exact');

  const row = assets.find((r) => r.asset === asset) ?? assets[0];
  const parsed = row ? parseAmountInput(amountText, row.decimals) : null;
  const amount = parsed?.ok ? parsed.value : null;

  const stepFor = (source: SupplyMarketRow | undefined, txRunning: boolean): NextStep =>
    nextStep({
      connected: isConnected,
      txLocked: !guard.safe,
      data: 'ready',
      txRunning,
      amount,
      balance: source?.walletBalance ?? 0n,
      allowance: source?.allowance ?? 0n,
      approvalMode,
      requiresApprovalReset: source?.requiresApprovalReset ?? false,
    });

  const supplyTx = useSupplyTx({
    chainId,
    user: address,
    asset: { address: row?.asset ?? asset, symbol: row?.symbol ?? '', decimals: row?.decimals ?? 0 },
    amount: amount ?? 0n,
    refreshStep: async () => {
      const fresh = await refetch();
      return stepFor(fresh.supplyMarket.find((r) => r.asset === row?.asset), false);
    },
  });
  const { tx } = supplyTx;
  const step = stepFor(row, tx.status === 'running');

  // Sesudah sukses jumlah dikosongkan, biar tombol nggak langsung menawarkan supply yang sama lagi, dan izin kembali
  // ke exact (unlimited hanya pilihan sadar per transaksi, #8). Pesan sukses tetap tampil sampai user mengisi jumlah
  // baru atau ganti aset (transaksi baru = status lama dibuang).
  useEffect(() => {
    if (tx.status !== 'success') return;
    setAmountText('');
    setApprovalMode('exact');
  }, [tx.status]);
  const startOver = () => {
    if (tx.status === 'success' || tx.status === 'error') supplyTx.reset();
  };

  if (!row) return null;
  const amountShown = amount !== null ? tokenAmount(amount, row.decimals) : '';
  const cta = ctaFor(step, row.symbol, amountShown);
  const showSteps = isWalletStep(step) && tx.status === 'idle';
  const asksApproval = step.step === 'approve' || step.step === 'resetApproval';
  const amountUsd = amount !== null ? Number(formatUnits(amount, row.decimals)) * row.priceUsd : 0;

  return (
    <aside className="surface flex flex-col gap-5 p-5">
      <div role="tablist" className="flex gap-5 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === 'supply'}
            aria-disabled={tab !== 'supply'}
            title={tab === 'supply' ? undefined : PANEL.soon}
            className={`tab text-sm ${tab === 'supply' ? '' : 'cursor-not-allowed opacity-40'}`}
          >
            {PANEL.tabs[tab]}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>{PANEL.amount}</span>
          {row.walletBalance !== null && (
            <span>
              {PANEL.wallet} <span className="num text-ink">{tokenAmount(row.walletBalance, row.decimals)}</span>
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 border-b border-line-strong pb-3 focus-within:border-accent">
          <input
            inputMode="decimal"
            placeholder="0"
            aria-label={PANEL.amount}
            value={amountText}
            disabled={tx.status === 'running'}
            onChange={(e) => {
              startOver();
              setAmountText(e.target.value.replace(/[^0-9.,]/g, ''));
            }}
            className="num w-full min-w-0 bg-transparent text-[32px] outline-none placeholder:text-faint focus-visible:outline-none"
          />
          <label className="btn-ghost flex shrink-0 items-center gap-2 py-1.5 pl-2 pr-1">
            <TokenIcon symbol={row.symbol} size={20} />
            <select
              value={row.asset}
              disabled={tx.status === 'running'}
              onChange={(e) => {
                startOver();
                setApprovalMode('exact');
                onAssetChange(e.target.value as Address);
              }}
              className="bg-transparent pr-1 text-sm font-medium outline-none"
              aria-label={PANEL.asset}
            >
              {assets.map((a) => (
                <option key={a.asset} value={a.asset} className="bg-panel">
                  {a.symbol}
                </option>
              ))}
            </select>
          </label>
        </div>
        {parsed && !parsed.ok && parsed.reason !== 'empty' && parsed.reason !== 'zero' && (
          <p className="mt-2 text-xs text-danger">
            {parsed.reason === 'too_many_decimals' ? PANEL.invalid.too_many_decimals(row.decimals) : PANEL.invalid[parsed.reason]}
          </p>
        )}
        <p className="num mt-2 text-xs text-muted">
          ≈ {usd(amountUsd)} · {PANEL.interest(usd(amountUsd * row.apy), pct(row.apy))}
        </p>
      </div>

      {asksApproval && (
        <ApprovalSettings mode={approvalMode} onChange={setApprovalMode} symbol={row.symbol} amount={amountShown} owner={address} chainId={chainId} />
      )}
      {showSteps && (
        <WalletSteps
          chainId={chainId}
          steps={plannedSteps(step)}
          token={row.asset}
          symbol={row.symbol}
          amount={amountShown}
          unlimited={approvalMode === 'unlimited'}
        />
      )}
      {tx.status !== 'idle' && (
        <TxProgress
          chainId={chainId}
          tx={tx}
          symbol={row.symbol}
          amount={amountShown}
          tokenAmount={(a) => tokenAmount(a, row.decimals)}
          unlimited={approvalMode === 'unlimited'}
          onRetry={() => (isWalletStep(step) ? void supplyTx.run(step) : supplyTx.reset())}
        />
      )}

      <button
        type="button"
        className="btn-accent w-full px-5 py-[15px] text-[15px]"
        disabled={!cta.enabled}
        onClick={() => {
          if (step.step === 'connect') openConnectModal?.();
          else if (isWalletStep(step)) void supplyTx.run(step);
        }}
      >
        {cta.label}
      </button>
    </aside>
  );
}

function ctaFor(step: NextStep, symbol: string, amount: string): { label: string; enabled: boolean } {
  switch (step.step) {
    case 'connect':
      return { label: CTA.connect, enabled: true };
    case 'insufficientBalance':
      return { label: CTA.insufficientBalance(symbol), enabled: false };
    case 'resetApproval':
      return { label: CTA.resetApproval(symbol), enabled: true };
    case 'approve':
      return { label: CTA.approve(symbol), enabled: true };
    case 'supply':
      return { label: CTA.supply(amount, symbol), enabled: true };
    default:
      return { label: CTA[step.step], enabled: false };
  }
}

function ApprovalSettings(props: {
  mode: NextStepInput['approvalMode'];
  onChange: (mode: NextStepInput['approvalMode']) => void;
  symbol: string;
  amount: string;
  owner: Address | undefined;
  chainId: number;
}) {
  return (
    <fieldset className="flex flex-col gap-2.5 rounded-md border border-line p-4 text-sm">
      <legend className="px-1 text-xs text-muted">{APPROVAL.legend(props.symbol)}</legend>
      <div role="radiogroup" aria-label={APPROVAL.ariaMode} className="flex w-fit gap-1 rounded-md bg-raised p-1">
        {(['exact', 'unlimited'] as const).map((mode) => (
          <label
            key={mode}
            className={`cursor-pointer rounded px-3 py-1 text-xs font-medium ${props.mode === mode ? 'bg-panel-hover text-ink' : 'text-muted'}`}
          >
            <input type="radio" className="sr-only" name="approvalMode" checked={props.mode === mode} onChange={() => props.onChange(mode)} />
            {mode === 'exact' ? APPROVAL.exact : APPROVAL.unlimited}
          </label>
        ))}
      </div>
      {props.mode === 'exact' ? (
        <p className="text-xs text-muted">{APPROVAL.exactNote(props.amount || '…', props.symbol)}</p>
      ) : (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">{APPROVAL.unlimitedWarning(props.symbol)}</p>
      )}
      {props.owner && (
        <a
          className="link w-fit text-xs text-muted"
          href={revokeCashUrl(props.owner, props.chainId)}
          target="_blank"
          rel="noreferrer"
        >
          {APPROVAL.revoke}
        </a>
      )}
    </fieldset>
  );
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function stepText(name: WalletStepName, symbol: string, amount: string, unlimited: boolean) {
  if (name === 'resetApproval') return { title: STEPS.resetApproval.title(symbol), detail: STEPS.resetApproval.detail(symbol) };
  if (name === 'approve') return { title: STEPS.approve.title(amount, symbol, unlimited), detail: STEPS.approve.detail(amount, symbol, unlimited) };
  return { title: STEPS.supply.title(amount, symbol), detail: STEPS.supply.detail };
}

function WalletSteps(props: { chainId: number; steps: WalletStepName[]; token: Address; symbol: string; amount: string; unlimited: boolean }) {
  const pool = AAVE[props.chainId].pool;
  return (
    <div>
      <h3 className="text-xs text-muted">{STEPS.heading}</h3>
      <ol className="mt-3 flex flex-col gap-3.5">
        {props.steps.map((name, i) => {
          const text = stepText(name, props.symbol, props.amount, props.unlimited);
          return (
            <li key={name} className="flex gap-3">
              <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[10px] text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">{text.title}</p>
                <p className="mt-0.5 text-xs text-muted">{text.detail}</p>
                {/* Approve dikirim ke kontrak token (itu yang tampil di wallet), dan yang diberi izin Aave Pool: dua-duanya
                    perlu bisa dicocokkan (spec 89). */}
                {name !== 'supply' && <OfficialAddress chainId={props.chainId} label={STEPS.token(props.symbol)} address={props.token} />}
                <OfficialAddress chainId={props.chainId} label={name === 'supply' ? STEPS.pool : STEPS.spender} address={pool} />
              </div>
            </li>
          );
        })}
      </ol>
      <SmartAccountNote />
    </div>
  );
}

// Semua alamat di sini dari @bgd-labs/aave-address-book (Q9), jadi boleh ditandai "alamat resmi Aave".
function OfficialAddress(props: { chainId: number; label: string; address: Address }) {
  return (
    <p className="mt-1 text-xs text-muted">
      {props.label} <span className="num text-ink">{short(props.address)}</span> · <span className="text-ink">{STEPS.official}</span> ·{' '}
      <a className="link" href={explorerAddressUrl(props.chainId, props.address)} target="_blank" rel="noreferrer">
        {STEPS.explorer}
      </a>
    </p>
  );
}

// Catatan smart account / gas sponsor (Q9): bisa ditutup dan nggak muncul lagi (localStorage).
function SmartAccountNote() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(SMART_ACCOUNT_NOTE_KEY) === '1');
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  return (
    <p className="mt-4 flex items-start gap-2 rounded-md bg-raised px-3 py-2.5 text-xs leading-relaxed text-muted">
      <span className="flex-1">{STEPS.smartAccountNote}</span>
      <button
        type="button"
        aria-label={STEPS.closeNote}
        className="hover:text-ink"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(SMART_ACCOUNT_NOTE_KEY, '1');
          } catch {}
        }}
      >
        ✕
      </button>
    </p>
  );
}

function TxProgress(props: {
  chainId: number;
  tx: Exclude<TxState, { status: 'idle' }>;
  symbol: string;
  amount: string;
  tokenAmount: (amount: bigint) => string;
  unlimited: boolean;
  onRetry: () => void;
}) {
  const { tx } = props;
  // Sesudah sukses input sudah dikosongkan: judul langkah memakai jumlah yang benar-benar dikirim.
  const amount = tx.status === 'success' ? props.tokenAmount(tx.amount) : props.amount;
  const statusOf = (i: number) => {
    if (tx.status === 'success' || i < tx.index) return <span className="text-ink">{TX.done}</span>;
    if (i > tx.index) return <span className="text-faint">{TX.pending}</span>;
    if (tx.status === 'running') return <span className="text-accent">{tx.phase === 'wallet' ? TX.waitingWallet : TX.waitingNetwork}</span>;
    return <span className="text-danger">{tx.kind === 'rejected' ? TX.rejectedStep : TX.failedStep}</span>;
  };
  return (
    <div aria-live="polite">
      <ol className="flex flex-col">
        {tx.steps.map((name, i) => (
          <li key={name} className="border-b border-line py-2.5 text-sm first:border-t">
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="num mr-2 text-faint">{i + 1}</span>
                {stepText(name, props.symbol, amount, props.unlimited).title}
              </span>
              <span className="shrink-0 text-xs">{statusOf(i)}</span>
            </span>
            {tx.sent[name] && <TxLink chainId={props.chainId} hash={tx.sent[name]} />}
          </li>
        ))}
      </ol>
      {tx.status === 'success' && (
        <p className="mt-3 text-sm">
          <span className="text-accent">✓</span> {TX.success(amount, props.symbol)}
        </p>
      )}
      {tx.status === 'error' && (
        <p className="mt-3 text-sm text-danger">
          {(tx.aaveError && TX_ERROR.aave[tx.aaveError]) ?? TX_ERROR[tx.kind]}{' '}
          <button type="button" className="link text-ink" onClick={props.onRetry}>
            {TX.retry}
          </button>
        </p>
      )}
    </div>
  );
}

// Tx fork nggak ada di explorer publik: cukup hash pendek, jangan tautan yang pasti 404.
function TxLink({ chainId, hash }: { chainId: number; hash: Hash }) {
  return (
    <span className="num mt-1 block pl-5 text-xs text-muted">
      {short(hash)} ·{' '}
      {IS_FORK ? (
        TX.forkTx
      ) : (
        <a className="link" href={explorerTxUrl(chainId, hash)} target="_blank" rel="noreferrer">
          {TX.explorer}
        </a>
      )}
    </span>
  );
}
