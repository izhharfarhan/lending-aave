'use client';

import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatUnits, maxUint256, type Address, type Hash } from 'viem';
import { useAccount } from 'wagmi';

import { isWalletStep, plannedSteps, usePoolTx, type TxState } from '@/aave/usePoolTx';
import { IS_FORK } from '@/config/appMode';
import { WHITELIST } from '@/config/assets';
import { chainName } from '@/config/chains';
import { AAVE, type AaveContracts } from '@/config/contracts';
import { explorerAddressUrl, explorerTxUrl, revokeCashUrl } from '@/config/explorer';
import type { ChainRead, ChainView, SupplyRow } from '@/core/chainPosition';
import type { NextStep, NextStepInput, WalletStepName } from '@/core/nextStep';
import { evaluatePanel, idleTx, PANEL_TABS, panelAssets, panelTx, routeOf, type PanelAsset, type PanelTab, type Route } from '@/core/panel';
import { parseAmountInput } from '@/core/parseAmountInput';
import { liquidationPrice, type Simulation } from '@/core/simulate';
import { APPROVAL, CTA, PANEL, GRANT, POSITION, RISK_CONFIRM, STEPS, TABLE, TX, TX_ERROR } from '@/copy';
import { useForkGuard } from '@/wallet/useForkGuard';
import { hf, pct, tokenAmount, usd } from './format';
import { HealthFactor } from './HealthFactor';
import { LiquidationText, liquidationText } from './LiquidationText';
import { TokenIcon } from './TokenIcon';

const SMART_ACCOUNT_NOTE_KEY = 'lending-web:smartAccountNoteDismissed';
const TABS = ['supply', 'withdraw', 'borrow', 'repay'] as const;

/** Jenis izin sebelum transaksi utama (teksnya di `GRANT`). */
type GrantKind = keyof typeof GRANT;
const isGrant = (name: WalletStepName) => name === 'approve' || name === 'resetApproval' || name === 'delegate';
// resetApproval cuma ada untuk ERC20 ala USDT (izin aWETH nggak perlu di-reset ke 0).
const grantOf = (name: WalletStepName, route: Route): GrantKind =>
  name === 'delegate' ? 'delegation' : name === 'approve' && route === 'gateway' ? 'aWeth' : 'pool';

export type ChainData = { read: ChainRead; view: ChainView };

/** Teks panel yang beda per tab (logika per tab ada di `PANEL_TABS`, core/panel.ts). */
const TAB_UI: Record<
  PanelTab,
  {
    empty: string;
    /** Bunga yang ditampilkan di bawah jumlah: bunga supply atau bunga pinjaman. */
    interest: typeof PANEL.interest;
    /** Tombol utama saat melewati batas LTV. */
    overLtv: string;
    /** Penjelasan saat dikunci di batas LTV. */
    locked: (symbol: string, chain: string) => string;
  }
> = {
  supply: { empty: PANEL.noSupplyAssets, interest: PANEL.interest, overLtv: CTA.overLtv, locked: () => RISK_CONFIRM.locked },
  // Menarik / mematikan jaminan = "Jaminan ini masih dibutuhkan"; "Melebihi batas pinjam" cuma untuk borrow.
  withdraw: { empty: PANEL.noSupplies, interest: PANEL.interest, overLtv: CTA.collateralNeeded, locked: () => RISK_CONFIRM.lockedWithdraw },
  borrow: { empty: PANEL.noBorrowAssets, interest: PANEL.borrowInterest, overLtv: CTA.overLtv, locked: () => RISK_CONFIRM.locked },
  repay: { empty: PANEL.noDebts, interest: PANEL.borrowInterest, overLtv: CTA.overLtv, locked: () => RISK_CONFIRM.locked },
  collateral: {
    empty: PANEL.noSupplies,
    interest: PANEL.interest,
    overLtv: CTA.collateralNeeded,
    locked: (symbol, chain) => RISK_CONFIRM.lockedCollateral(symbol, chain),
  },
};

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

// Panel aksi di samping detail chain (Q20): tab Supply, Withdraw, Borrow, Repay (ETH lewat gateway), plus mode toggle jaminan
// (dari switch di "Supply Anda"). Panel cuma dirender sesudah data posisi siap (sebelumnya skeleton / "gagal dimuat"),
// jadi `data` selalu `ready` di sini.
export function ActionPanel({ chainId, data, tab, asset, onSelect, refetch }: Props) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const guard = useForkGuard(chainId);
  const whitelist = WHITELIST[chainId];
  const ui = TAB_UI[tab];
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

  const state = evaluate(data, false);
  const { sim, repay, withdraw } = state;
  const ptx = row ? panelTx(row, state, amount) : null;
  const poolTx = usePoolTx({
    chainId,
    user: address,
    asset: { address: row?.asset ?? '0x', symbol: row?.symbol ?? '', decimals: row?.decimals ?? 0 },
    plan: ptx ?? idleTx(tab),
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
  // Pilihan baru (dari tab, dropdown aset, atau klik tabel/switch di detail chain) = transaksi baru: status lama, jumlah,
  // izin, dan konfirmasi risiko dibuang.
  const selection = `${tab}:${asset ?? ''}`;
  const [shownSelection, setShownSelection] = useState(selection);
  if (selection !== shownSelection) {
    setShownSelection(selection);
    setAmountText('');
    setApprovalMode('exact');
    resetRisk();
    if (tx.status === 'success' || tx.status === 'error') poolTx.reset();
  }

  const copy: StepCopy = {
    symbol: row?.symbol ?? '',
    amount: tokenAmount(ptx?.shown ?? 0n, row?.decimals ?? 0),
    approveAmount: tokenAmount(repay?.spend ?? withdraw?.spend ?? amount ?? 0n, row?.decimals ?? 0),
    full: ptx?.full ?? false,
    // Dari `progressRow`: sesudah repay ETH lunas barisnya hilang, tapi progresnya tetap jalur gateway.
    route: routeOf(tab, progressRow?.native ?? false),
    enable: ptx?.useAsCollateral ?? false,
    unlimited: approvalMode === 'unlimited',
  };
  const cta = row ? ctaFor(step, tab, copy) : null;
  const showSteps = isWalletStep(step) && tx.status === 'idle';
  const grant = isWalletStep(step) && isGrant(step.step) ? grantOf(step.step, copy.route) : null;
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
            disabled={tx.status === 'running'}
            onClick={() => t !== tab && onSelect(t)}
            className="tab text-sm"
          >
            {PANEL.tabs[t]}
          </button>
        ))}
      </div>

      {!row ? (
        <p className="text-sm text-muted">{ui.empty}</p>
      ) : (
        <>
          {row.tab === 'collateral' ? (
            <div>
              <p className="flex items-center gap-2.5 text-base font-medium">
                <TokenIcon symbol={row.symbol} /> {PANEL.collateralTitle(row.symbol)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {row.collateral ? PANEL.collateralOn(row.symbol) : PANEL.collateralOff(row.symbol)}
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>{PANEL.amount}</span>
                <Balances row={row} />
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
                    onChange={(e) => onSelect(tab, e.target.value as Address)}
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
                ≈ {usd(amountUsd)} · {ui.interest(usd(amountUsd * row.apy), pct(row.apy))}
              </p>
              {isConnected && row.tab === 'borrow' && (
                <p className="mt-3 text-xs text-muted">
                  {PANEL.collateralOf(chainName(chainId))}{' '}
                  <span className="text-ink">
                    {collateral.length
                      ? collateral.map((s) => `${tokenAmount(s.amount, s.decimals)} ${s.symbol}`).join(' + ')
                      : PANEL.noCollateral}
                  </span>{' '}
                  ·{' '}
                  <button type="button" className="link" onClick={() => onSelect('supply')}>
                    {PANEL.changeCollateral}
                  </button>
                </p>
              )}
              {row.tab === 'repay' && repay?.full && (
                <p className="mt-3 text-xs text-muted">
                  {PANEL.repayFull[copy.route](tokenAmount(row.debt, row.decimals), row.symbol, tokenAmount(repay.spend, row.decimals))}
                </p>
              )}
              {row.tab === 'withdraw' && withdraw?.all && (
                <p className="mt-3 text-xs text-muted">
                  {PANEL.withdrawAll[copy.route](tokenAmount(row.supplied, row.decimals), row.symbol, tokenAmount(withdraw.spend, row.decimals))}
                </p>
              )}
            </div>
          )}

          {isConnected && tab !== 'supply' && data.view.account && <Outlook data={data} chainId={chainId} sim={sim} />}
          {sim && tx.status === 'idle' && (
            <RiskConfirm
              sim={sim}
              step={step}
              supplies={data.view.supplies}
              symbol={row.symbol}
              lockedText={ui.locked(row.symbol, chainName(chainId))}
              checked={riskChecked}
              onCheck={setRiskChecked}
              typed={riskTyped}
              onType={setRiskTyped}
            />
          )}

          {step.step === 'paused' && <p className="rounded-md bg-raised px-4 py-3 text-sm text-muted">{RISK_CONFIRM.paused}</p>}
          {grant && (
            <ApprovalSettings
              kind={grant}
              mode={approvalMode}
              onChange={setApprovalMode}
              symbol={row.symbol}
              amount={copy.approveAmount}
              owner={address}
              chainId={chainId}
            />
          )}
          {showSteps && <WalletSteps {...copy} chainId={chainId} steps={plannedSteps(step, PANEL_TABS[tab].main)} token={row.asset} />}
        </>
      )}
      {progressRow && tx.status !== 'idle' && (
        <TxProgress
          {...copy}
          symbol={progressRow.symbol}
          chainId={chainId}
          tx={tx}
          tokenAmount={(a) => tokenAmount(a, progressRow.decimals)}
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
            else if (step.step === 'needCollateral') onSelect('supply');
            else if (isWalletStep(step)) void poolTx.run(step);
          }}
        >
          {cta.label}
        </button>
      )}
    </aside>
  );
}

/** Saldo di atas input jumlah: yang relevan untuk tab itu. */
function Balances({ row }: { row: PanelAsset }) {
  const fact = (label: string, amount: bigint) => (
    <span key={label}>
      {label} <span className="num text-ink">{tokenAmount(amount, row.decimals)}</span>
    </span>
  );
  const facts = (() => {
    switch (row.tab) {
      case 'supply':
        return row.walletBalance === null ? [] : [fact(PANEL.wallet, row.walletBalance)];
      case 'withdraw':
        return [fact(PANEL.supplied, row.supplied)];
      case 'borrow':
        return row.borrowable === null ? [] : [fact(TABLE.canBorrow, row.borrowable)];
      case 'repay':
        return [fact(PANEL.debt, row.debt), ...(row.walletBalance === null ? [] : [fact(PANEL.wallet, row.walletBalance)])];
      case 'collateral':
        return [];
    }
  })();
  return <span className="flex gap-3">{facts}</span>;
}

function ctaFor(step: NextStep, tab: PanelTab, c: StepCopy): { label: string; enabled: boolean } {
  switch (step.step) {
    case 'connect':
      return { label: CTA.connect, enabled: true };
    case 'needCollateral':
      return { label: CTA.needCollateral, enabled: true };
    case 'insufficientBalance':
      return { label: CTA.insufficientBalance(c.symbol), enabled: false };
    case 'overLtv':
      return { label: TAB_UI[tab].overLtv, enabled: false };
    case 'confirmRisk':
      return { label: CTA.confirmRisk[step.gate], enabled: false };
    case 'resetApproval':
      return { label: CTA.resetApproval(c.symbol, tab), enabled: true };
    case 'approve':
    case 'delegate':
      return { label: GRANT[grantOf(step.step, c.route)].cta(c.symbol, tab), enabled: true };
    case 'supply':
      return { label: CTA.supply(c.amount, c.symbol), enabled: true };
    case 'withdraw':
      return { label: c.full ? CTA.withdrawAll(c.symbol) : CTA.withdraw(c.amount, c.symbol), enabled: true };
    case 'borrow':
      return { label: CTA.borrow(c.amount, c.symbol), enabled: true };
    case 'repay':
      return { label: c.full ? CTA.repayFull(c.symbol) : CTA.repay(c.amount, c.symbol), enabled: true };
    case 'setCollateral':
      return { label: CTA.setCollateral(c.enable, c.symbol), enabled: true };
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
// Aturan kontrak yang menolak aksi (ltv0, aset ber-LTV 0) didahulukan dari tier #9: penjelasannya beda.
function RiskConfirm(props: {
  sim: Simulation;
  step: NextStep;
  /** Untuk menyebut jaminan ber-LTV 0 di pesan aturan ltv0. */
  supplies: SupplyRow[];
  lockedText: string;
  symbol: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  typed: string;
  onType: (v: string) => void;
}) {
  const { sim } = props;
  const hfAfter = sim.account.healthFactor === null ? '' : hf(sim.account.healthFactor);
  if (props.step.step === 'paused') return null;
  if (props.step.step === 'ltvZero') {
    const ltvZero = props.supplies.filter((s) => s.collateral && !s.canBeCollateral);
    const names = ltvZero.map((s) => s.symbol).join(', ');
    return (
      <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{RISK_CONFIRM.ltvZero(names, ltvZero.every((s) => s.outside))}</p>
    );
  }
  if (props.step.step === 'cannotBeCollateral') {
    return <p className="rounded-md bg-raised px-4 py-3 text-sm text-muted">{RISK_CONFIRM.cannotBeCollateral(props.symbol)}</p>;
  }
  switch (sim.gate) {
    case 'warn':
      return <p className="rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">{RISK_CONFIRM.warn(hfAfter)}</p>;
    case 'check':
      return (
        <label className="flex cursor-pointer items-start gap-3 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <input type="checkbox" className="mt-1 accent-[var(--danger)]" checked={props.checked} onChange={(e) => props.onCheck(e.target.checked)} />
          <span>{RISK_CONFIRM.check(hfAfter, sim.liquidation.kind === 'price' ? (liquidationText(sim.liquidation)?.text ?? '') : '')}</span>
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
      return <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{props.lockedText}</p>;
    default:
      return null;
  }
}

function ApprovalSettings(props: {
  kind: GrantKind;
  mode: NextStepInput['approvalMode'];
  onChange: (mode: NextStepInput['approvalMode']) => void;
  symbol: string;
  amount: string;
  owner: Address | undefined;
  chainId: number;
}) {
  const text = GRANT[props.kind];
  // Delegation nggak punya pilihan Unlimited (selalu exact, keputusan tiket 07).
  const warning = text.unlimitedWarning;
  return (
    <fieldset className="flex flex-col gap-2.5 rounded-md border border-line p-4 text-sm">
      <legend className="px-1 text-xs text-muted">{text.legend(props.symbol)}</legend>
      {warning && (
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
      )}
      {warning && props.mode === 'unlimited' ? (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">{warning(props.symbol)}</p>
      ) : (
        <p className="text-xs text-muted">{text.exactNote(props.amount || '…', props.symbol)}</p>
      )}
      {props.owner && text.revocable && (
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

type StepCopy = {
  symbol: string;
  amount: string;
  approveAmount: string;
  /** Repay lunas penuh / withdraw semua. */
  full: boolean;
  /** Toggle jaminan: nyalakan atau matikan. */
  enable: boolean;
  unlimited: boolean;
  route: Route;
};

function stepText(name: WalletStepName, c: StepCopy) {
  switch (name) {
    case 'resetApproval':
      return { title: STEPS.resetApproval.title(c.symbol), detail: STEPS.resetApproval.detail(c.symbol) };
    case 'approve':
    case 'delegate': {
      const text = GRANT[grantOf(name, c.route)];
      return { title: text.title(c.approveAmount, c.symbol, c.unlimited), detail: text.detail(c.approveAmount, c.symbol, c.unlimited) };
    }
    case 'supply':
      return { title: STEPS.supply.title(c.amount, c.symbol), detail: STEPS.supply.detail[c.route] };
    case 'borrow':
      return { title: STEPS.borrow.title(c.amount, c.symbol), detail: STEPS.borrow.detail[c.route] };
    case 'repay':
      return {
        title: c.full ? STEPS.repay.titleFull(c.symbol) : STEPS.repay.title(c.amount, c.symbol),
        detail: STEPS.repay.detail[c.route],
      };
    case 'withdraw':
      return {
        title: c.full ? STEPS.withdraw.titleAll(c.symbol) : STEPS.withdraw.title(c.amount, c.symbol),
        detail: STEPS.withdraw.detail[c.route],
      };
    case 'setCollateral':
      return { title: STEPS.setCollateral.title(c.enable, c.symbol), detail: STEPS.setCollateral.detail };
  }
}

type Contract = { label: string; address: Address };

// Kontrak yang bisa dicocokkan per langkah (spec 89). Izin: kontrak tokennya (itu yang tampil di wallet) + yang diberi
// izin. Transaksi utama: tujuannya, Pool atau gateway sesuai jalur.
function stepContracts(name: WalletStepName, route: Route, contracts: AaveContracts, token: Contract): Contract[] {
  const pool = { label: STEPS.pool, address: contracts.pool };
  const gateway = { label: STEPS.gateway, address: contracts.wrappedTokenGateway };
  const to = route === 'gateway' ? gateway : pool;
  if (!isGrant(name)) return [to];
  const grantToken = {
    pool: token,
    aWeth: { label: STEPS.aWeth, address: contracts.aWeth },
    delegation: { label: STEPS.debtToken, address: contracts.variableDebtWeth },
  }[grantOf(name, route)];
  return [grantToken, { label: STEPS.spender(to.label), address: to.address }];
}

function WalletSteps(props: StepCopy & { chainId: number; steps: WalletStepName[]; token: Address }) {
  const contracts = AAVE[props.chainId];
  const token = { label: STEPS.token(props.symbol), address: props.token };
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
                {stepContracts(name, props.route, contracts, token).map((c) => (
                  <OfficialAddress key={c.address} chainId={props.chainId} {...c} />
                ))}
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
    enable: done ? tx.kind === 'collateralOn' : props.enable,
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
          <span className="text-accent">✓</span> {TX.success[tx.kind](amount, props.symbol)}
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
