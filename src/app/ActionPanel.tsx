'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatUnits, maxUint256, type Address, type Hash } from 'viem';
import { useAccount } from 'wagmi';

import { isWalletStep, plannedSteps, usePoolTx, type TxState } from '@/aave/usePoolTx';
import { IS_FORK } from '@/config/appMode';
import { WHITELIST } from '@/config/assets';
import { chainName } from '@/config/chains';
import { AAVE } from '@/config/contracts';
import { explorerAddressUrl, explorerTxUrl, revokeCashUrl } from '@/config/explorer';
import type { ChainRead, ChainView } from '@/core/chainPosition';
import type { NextStep, NextStepInput, WalletStepName } from '@/core/nextStep';
import { evaluatePanel, panelAssets, type PanelAsset, type PanelTab } from '@/core/panel';
import { parseAmountInput } from '@/core/parseAmountInput';
import { liquidationPrice, type Simulation } from '@/core/simulate';
import { APPROVAL, CTA, PANEL, POSITION, RISK_CONFIRM, STEPS, TABLE, TX, TX_ERROR } from '@/copy';
import { useForkGuard } from '@/wallet/useForkGuard';
import { hf, pct, tokenAmount, usd } from './format';
import { HealthFactor } from './HealthFactor';
import { LiquidationText, liquidationText } from './LiquidationText';
import { TokenIcon } from './TokenIcon';

const SMART_ACCOUNT_NOTE_KEY = 'lending-web:smartAccountNoteDismissed';
const TABS = ['supply', 'withdraw', 'borrow', 'repay'] as const;
const isPanelTab = (tab: (typeof TABS)[number]): tab is PanelTab => tab !== 'withdraw';

export type ChainData = { read: ChainRead; view: ChainView };

type Props = {
  chainId: number;
  data: ChainData;
  tab: PanelTab;
  /** `undefined` = aset pertama di tab itu. */
  asset: Address | undefined;
  onSelect: (tab: PanelTab, asset?: Address) => void;
  /** Baca ulang posisi; melempar kalau gagal, jangan kembalikan data lama. */
  refetch: () => Promise<ChainData>;
};

// Panel aksi di samping detail chain (Q20): tab Supply, Borrow, Repay untuk ERC20; Withdraw menyusul (tiket 05). Panel
// cuma dirender sesudah data posisi siap (sebelumnya skeleton / "gagal dimuat"), jadi `data` selalu `ready` di sini.
export function ActionPanel({ chainId, data, tab, asset, onSelect, refetch }: Props) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const guard = useForkGuard(chainId);
  const whitelist = WHITELIST[chainId];
  const [amountText, setAmountText] = useState('');
  const [approvalMode, setApprovalMode] = useState<NextStepInput['approvalMode']>('exact');
  const [riskChecked, setRiskChecked] = useState(false);
  const [riskTyped, setRiskTyped] = useState('');

  const assets = panelAssets(data.view, tab);
  const row = assets.find((r) => r.asset === asset) ?? (asset === undefined ? assets[0] : undefined);
  // Sesudah repay lunas penuh baris utangnya hilang; pesan suksesnya tetap butuh simbol & desimal aset itu.
  const lastRow = useRef<PanelAsset | undefined>(undefined);
  if (row) lastRow.current = row;
  const progressRow = row ?? lastRow.current;
  const parsed = row ? parseAmountInput(amountText, row.decimals) : null;
  const amount = parsed?.ok ? parsed.value : null;

  // Semua yang bergantung pada data posisi dihitung ulang dari data segar sesudah tiap langkah wallet.
  const evaluate = (fresh: ChainData, txRunning: boolean) =>
    evaluatePanel(fresh.read, fresh.view, whitelist, {
      connected: isConnected,
      txLocked: !guard.safe,
      txRunning,
      approvalMode,
      tab,
      asset: row?.asset ?? '0x',
      amount,
      riskChecked,
      riskTyped: riskTyped.trim().toLowerCase() === RISK_CONFIRM.word,
    });

  const { sim, plan } = evaluate(data, false);
  // Repay lunas penuh: yang dikirim `type(uint256).max`, yang ditampilkan & dicatat utang saat ini.
  const shownAmount = plan?.full ? (row?.debt ?? 0n) : (amount ?? 0n);
  const poolTx = usePoolTx({
    chainId,
    user: address,
    main: tab,
    asset: { address: row?.asset ?? '0x', symbol: row?.symbol ?? '', decimals: row?.decimals ?? 0 },
    send: plan?.send ?? amount ?? 0n,
    amount: shownAmount,
    refreshStep: async () => evaluate(await refetch(), false).step,
  });
  const { tx } = poolTx;
  const { step } = evaluate(data, tx.status === 'running');

  // Sesudah sukses jumlah dikosongkan, biar tombol nggak langsung menawarkan transaksi yang sama lagi, dan izin kembali
  // ke exact (unlimited hanya pilihan sadar per transaksi, #8). Pesan sukses tetap tampil sampai user mengisi jumlah
  // baru atau ganti aset/tab (transaksi baru = status lama dibuang).
  useEffect(() => {
    if (tx.status !== 'success') return;
    setAmountText('');
    setApprovalMode('exact');
    resetRisk();
  }, [tx.status]);
  const resetRisk = () => {
    setRiskChecked(false);
    setRiskTyped('');
  };
  const startOver = () => {
    if (tx.status === 'success' || tx.status === 'error') poolTx.reset();
  };
  const select = (nextTab: PanelTab, nextAsset?: Address) => {
    startOver();
    setAmountText('');
    setApprovalMode('exact');
    resetRisk();
    onSelect(nextTab, nextAsset);
  };

  const amountShown = tokenAmount(shownAmount, row?.decimals ?? 0);
  const approveShown = tokenAmount(plan?.spend ?? amount ?? 0n, row?.decimals ?? 0);
  const cta = row ? ctaFor(step, row.symbol, amountShown, tab, plan?.full ?? false) : null;
  const showSteps = isWalletStep(step) && tx.status === 'idle';
  const asksApproval = step.step === 'approve' || step.step === 'resetApproval';
  const amountUsd = row && amount !== null ? Number(formatUnits(amount, row.decimals)) * row.priceUsd : 0;
  const collateral = data.view.supplies.filter((s) => s.collateral);

  return (
    <aside className="surface flex flex-col gap-5 p-5">
      <div role="tablist" className="flex gap-5 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            aria-disabled={!isPanelTab(t)}
            title={isPanelTab(t) ? undefined : PANEL.soon}
            disabled={tx.status === 'running'}
            onClick={() => isPanelTab(t) && t !== tab && select(t)}
            className={`tab text-sm ${isPanelTab(t) ? '' : 'cursor-not-allowed opacity-40'}`}
          >
            {PANEL.tabs[t]}
          </button>
        ))}
      </div>

      {!row ? (
        <p className="text-sm text-muted">{tab === 'repay' ? PANEL.noDebts : PANEL.noBorrowAssets}</p>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>{PANEL.amount}</span>
              <span className="flex gap-3">
                {row.debt !== undefined && (
                  <span>
                    {PANEL.debt} <span className="num text-ink">{tokenAmount(row.debt, row.decimals)}</span>
                  </span>
                )}
                {row.walletBalance !== null && (
                  <span>
                    {PANEL.wallet} <span className="num text-ink">{tokenAmount(row.walletBalance, row.decimals)}</span>
                  </span>
                )}
                {row.borrowable !== undefined && row.borrowable !== null && (
                  <span>
                    {TABLE.canBorrow} <span className="num text-ink">{tokenAmount(row.borrowable, row.decimals)}</span>
                  </span>
                )}
              </span>
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
                  resetRisk();
                  setAmountText(e.target.value.replace(/[^0-9.,]/g, ''));
                }}
                className="num w-full min-w-0 bg-transparent text-[32px] outline-none placeholder:text-faint focus-visible:outline-none"
              />
              <label className="btn-ghost flex shrink-0 items-center gap-2 py-1.5 pl-2 pr-1">
                <TokenIcon symbol={row.symbol} size={20} />
                <select
                  value={row.asset}
                  disabled={tx.status === 'running'}
                  onChange={(e) => select(tab, e.target.value as Address)}
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
              ≈ {usd(amountUsd)} ·{' '}
              {tab === 'supply' ? PANEL.interest(usd(amountUsd * row.apy), pct(row.apy)) : PANEL.borrowInterest(usd(amountUsd * row.apy), pct(row.apy))}
            </p>
            {isConnected && tab === 'borrow' && (
              <p className="mt-3 text-xs text-muted">
                {PANEL.collateralOf(chainName(chainId))}{' '}
                <span className="text-ink">
                  {collateral.length
                    ? collateral.map((s) => `${tokenAmount(s.amount, s.decimals)} ${s.symbol}`).join(' + ')
                    : PANEL.noCollateral}
                </span>{' '}
                ·{' '}
                <button type="button" className="link" onClick={() => select('supply')}>
                  {PANEL.changeCollateral}
                </button>
              </p>
            )}
            {plan?.full && row.debt !== undefined && (
              <p className="mt-3 text-xs text-muted">
                {PANEL.repayFull(tokenAmount(row.debt, row.decimals), row.symbol, tokenAmount(plan.spend, row.decimals))}
              </p>
            )}
          </div>

          {isConnected && tab !== 'supply' && data.view.account && (
            <Outlook data={data} chainId={chainId} sim={sim} />
          )}
          {tab === 'borrow' && sim && tx.status === 'idle' && (
            <RiskConfirm
              sim={sim}
              checked={riskChecked}
              onCheck={setRiskChecked}
              typed={riskTyped}
              onType={setRiskTyped}
            />
          )}

          {asksApproval && (
            <ApprovalSettings
              mode={approvalMode}
              onChange={setApprovalMode}
              symbol={row.symbol}
              amount={approveShown}
              owner={address}
              chainId={chainId}
            />
          )}
          {showSteps && (
            <WalletSteps
              chainId={chainId}
              steps={plannedSteps(step, tab)}
              token={row.asset}
              symbol={row.symbol}
              amount={amountShown}
              approveAmount={approveShown}
              full={plan?.full ?? false}
              unlimited={approvalMode === 'unlimited'}
            />
          )}
        </>
      )}
      {progressRow && tx.status !== 'idle' && (
        <TxProgress
          chainId={chainId}
          tx={tx}
          main={tab}
          symbol={progressRow.symbol}
          amount={amountShown}
          approveAmount={approveShown}
          full={plan?.full ?? false}
          tokenAmount={(a) => tokenAmount(a, progressRow.decimals)}
          unlimited={approvalMode === 'unlimited'}
          onRetry={() => (isWalletStep(step) ? void poolTx.run(step) : poolTx.reset())}
        />
      )}

      {row && cta && (
        <button
          type="button"
          className="btn-accent w-full px-5 py-[15px] text-[15px]"
          disabled={!cta.enabled}
          onClick={() => {
            if (step.step === 'connect') openConnectModal?.();
            else if (step.step === 'needCollateral') select('supply');
            else if (isWalletStep(step)) void poolTx.run(step);
          }}
        >
          {cta.label}
        </button>
      )}
    </aside>
  );
}

function ctaFor(step: NextStep, symbol: string, amount: string, tab: PanelTab, full: boolean): { label: string; enabled: boolean } {
  switch (step.step) {
    case 'connect':
      return { label: CTA.connect, enabled: true };
    case 'needCollateral':
      return { label: CTA.needCollateral, enabled: true };
    case 'insufficientBalance':
      return { label: CTA.insufficientBalance(symbol), enabled: false };
    case 'confirmRisk':
      return { label: CTA.confirmRisk[step.gate], enabled: false };
    case 'resetApproval':
      return { label: CTA.resetApproval(symbol, tab), enabled: true };
    case 'approve':
      return { label: CTA.approve(symbol, tab), enabled: true };
    case 'supply':
      return { label: CTA.supply(amount, symbol), enabled: true };
    case 'borrow':
      return { label: CTA.borrow(amount, symbol), enabled: true };
    case 'repay':
      return { label: full ? CTA.repayFull(symbol) : CTA.repay(amount, symbol), enabled: true };
    default:
      return { label: CTA[step.step], enabled: false };
  }
}

// HF, harga likuidasi, dan sisa batas pinjam sebelum → sesudah (spec 69). "Sebelum" dari getUserAccountData, "sesudah"
// dari simulasi modul domain (dibuktikan sama lewat test paritas).
function Outlook({ data, chainId, sim }: { data: ChainData; chainId: number; sim: Simulation | null }) {
  const account = data.view.account!;
  const liqBefore = liquidationPrice(data.read, WHITELIST[chainId]);
  const liqShown = sim ? sim.liquidation : liqBefore;
  return (
    <dl className="divide-y divide-line border-y border-line text-sm">
      <OutlookRow label={POSITION.healthFactor} info={POSITION.hfInfo}>
        {account.healthFactor === null && (!sim || sim.account.healthFactor === null) ? (
          <span className="text-muted">{POSITION.noDebt}</span>
        ) : (
          <span>
            <HealthFactor value={account.healthFactor} withLabel={!sim} /> <span className="text-faint">{PANEL.arrow}</span>{' '}
            {sim ? <HealthFactor value={sim.account.healthFactor} /> : <span className="text-faint">{PANEL.pendingAfter}</span>}
          </span>
        )}
      </OutlookRow>
      {liquidationText(liqShown) && (
        <OutlookRow label={POSITION.liquidation} info={POSITION.liquidationInfo}>
          <span className="text-xs">
            <LiquidationText liq={liqShown} current={!sim} />
          </span>
        </OutlookRow>
      )}
      <OutlookRow label={POSITION.available}>
        <span className="num">
          {usd(account.availableBorrowsUsd)} <span className="text-faint">{PANEL.arrow}</span>{' '}
          {sim ? usd(sim.account.availableBorrowsUsd) : <span className="text-faint">{PANEL.pendingAfter}</span>}
        </span>
      </OutlookRow>
    </dl>
  );
}

function OutlookRow({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-muted" title={info}>
        {label}
        {info && <span className="ml-1 text-[10px] text-faint">ⓘ</span>}
      </dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

// Tingkat konfirmasi #9: amber cuma peringatan; centang dan ketik "confirm" menahan tombol utama (lewat nextStep).
function RiskConfirm(props: { sim: Simulation; checked: boolean; onCheck: (v: boolean) => void; typed: string; onType: (v: string) => void }) {
  const { sim } = props;
  const hfAfter = sim.account.healthFactor === null ? '' : hf(sim.account.healthFactor);
  switch (sim.gate) {
    case 'warn':
      return <p className="rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">{RISK_CONFIRM.warn(hfAfter)}</p>;
    case 'check':
      return (
        <label className="flex cursor-pointer items-start gap-3 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <input type="checkbox" className="mt-1 accent-[var(--danger)]" checked={props.checked} onChange={(e) => props.onCheck(e.target.checked)} />
          <span>{RISK_CONFIRM.check(hfAfter, liquidationText(sim.liquidation)?.text ?? '')}</span>
        </label>
      );
    case 'type':
      return (
        <div className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <p>{RISK_CONFIRM.type(hfAfter)}</p>
          <input
            value={props.typed}
            aria-label={RISK_CONFIRM.typeLabel}
            onChange={(e) => props.onType(e.target.value)}
            className="num mt-3 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-ink outline-none"
            placeholder={RISK_CONFIRM.typePlaceholder}
          />
        </div>
      );
    case 'locked':
      return <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{RISK_CONFIRM.locked}</p>;
    default:
      return null;
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

type StepCopy = { symbol: string; amount: string; approveAmount: string; full: boolean; unlimited: boolean };

function stepText(name: WalletStepName, c: StepCopy) {
  switch (name) {
    case 'resetApproval':
      return { title: STEPS.resetApproval.title(c.symbol), detail: STEPS.resetApproval.detail(c.symbol) };
    case 'approve':
      return {
        title: STEPS.approve.title(c.approveAmount, c.symbol, c.unlimited),
        detail: STEPS.approve.detail(c.approveAmount, c.symbol, c.unlimited),
      };
    case 'supply':
      return { title: STEPS.supply.title(c.amount, c.symbol), detail: STEPS.supply.detail };
    case 'borrow':
      return { title: STEPS.borrow.title(c.amount, c.symbol), detail: STEPS.borrow.detail };
    case 'repay':
      return { title: c.full ? STEPS.repay.titleFull(c.symbol) : STEPS.repay.title(c.amount, c.symbol), detail: STEPS.repay.detail };
  }
}

const isApproval = (name: WalletStepName) => name === 'approve' || name === 'resetApproval';

function WalletSteps(props: StepCopy & { chainId: number; steps: WalletStepName[]; token: Address }) {
  const pool = AAVE[props.chainId].pool;
  return (
    <div>
      <h3 className="text-xs text-muted">{STEPS.heading}</h3>
      <ol className="mt-3 flex flex-col gap-3.5">
        {props.steps.map((name, i) => {
          const text = stepText(name, props);
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
                {isApproval(name) && <OfficialAddress chainId={props.chainId} label={STEPS.token(props.symbol)} address={props.token} />}
                <OfficialAddress chainId={props.chainId} label={isApproval(name) ? STEPS.spender : STEPS.pool} address={pool} />
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

function TxProgress(
  props: StepCopy & {
    chainId: number;
    tx: Exclude<TxState, { status: 'idle' }>;
    main: PanelTab;
    tokenAmount: (amount: bigint) => string;
    onRetry: () => void;
  },
) {
  const { tx } = props;
  // Sesudah sukses input sudah dikosongkan: judul langkah memakai jumlah yang benar-benar dikirim.
  const done = tx.status === 'success';
  const amount = done ? props.tokenAmount(tx.amount) : props.amount;
  const copy = {
    ...props,
    amount,
    approveAmount: done && tx.approved !== undefined ? props.tokenAmount(tx.approved) : props.approveAmount,
    unlimited: done && tx.approved !== undefined ? tx.approved === maxUint256 : props.unlimited,
  };
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
                {stepText(name, copy).title}
              </span>
              <span className="shrink-0 text-xs">{statusOf(i)}</span>
            </span>
            {tx.sent[name] && <TxLink chainId={props.chainId} hash={tx.sent[name]} />}
          </li>
        ))}
      </ol>
      {tx.status === 'success' && (
        <p className="mt-3 text-sm">
          <span className="text-accent">✓</span> {TX.success[props.main](amount, props.symbol)}
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
