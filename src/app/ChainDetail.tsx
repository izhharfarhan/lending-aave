'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { Address } from 'viem';
import { useAccount } from 'wagmi';

import { useChainView } from '@/aave/useChainView';
import { WHITELIST } from '@/config/assets';
import { chainHref, chainName, supportedChain } from '@/config/chains';
import {
  visibleSupplyMarket,
  type AccountView,
  type ChainView,
  type ReserveStatus,
} from '@/core/chainPosition';
import { panelAssets, type PanelTab } from '@/core/panel';
import { liquidationPrice, type LiqPrice } from '@/core/simulate';
import { PANEL, POSITION, TABLE } from '@/copy';
import { ActionPanel } from './ActionPanel';
import { pct, tokenAmount, usd } from './format';
import { HealthFactor, RISK_BAR } from './HealthFactor';
import { LiquidationText } from './LiquidationText';
import { RescuePanel } from './RescuePanel';
import { TokenIcon } from './TokenIcon';

const AAVE_APP_URL = 'https://app.aave.com/';

/**
 * Baris yang dibuka di panel: tab + aset. `asset` kosong = aset pertama tab itu (belum dipilih dari tabel). `rescue` =
 * panel penyelamatan (Q29), dibuka dari "Lihat <chain>" di banner Bahaya.
 */
type Picked = { tab: PanelTab; asset?: Address } | { tab: 'rescue'; asset?: undefined };
const initialPick = (rescue: boolean): Picked => ({ tab: rescue ? 'rescue' : 'supply' });

// Detail chain terpilih (Q20, prototype): kepala HF + harga likuidasi + sisa batas pinjam, empat tabel datar, dan panel
// aksi di kanan. Klik baris membuka tab yang sesuai: Pasar supply → Supply, Pasar pinjam → Borrow, Supply Anda →
// Withdraw (switch jaminannya → mode jaminan), Utang Anda → Repay. ETH di semua tab lewat gateway. `rescue` = URL
// berisi `panel=penyelamatan` (banner Bahaya): panel penyelamatan menggantikan panel aksi sampai user memilih.
export function ChainDetail({ chainId, rescue }: { chainId: number; rescue: boolean }) {
  const { data, isPending, isError, refetch } = useChainView(chainId);
  const { isConnected } = useAccount();
  const router = useRouter();
  const [picked, setPicked] = useState<Picked>(() => initialPick(rescue));
  // Banner diklik lagi saat chain ini sudah terbuka: komponen nggak dipasang ulang, jadi buka panelnya dari sini.
  const [prevRescue, setPrevRescue] = useState(rescue);
  if (rescue !== prevRescue) {
    setPrevRescue(rescue);
    if (rescue) setPicked(initialPick(true));
  }
  const name = chainName(chainId);

  if (isPending)
    return (
      <div aria-label={POSITION.loading} className="flex flex-col gap-3">
        <span className="skeleton block h-7 w-48" />
        <span className="skeleton block h-40 w-full" />
      </div>
    );
  if (isError)
    return (
      <div role="alert" className="surface bg-danger-soft p-5 text-sm text-danger">
        {POSITION.failed(name)} {isConnected && `${POSITION.notCounted} `}
        <button type="button" className="link text-ink" onClick={() => refetch()}>
          {POSITION.retry}
        </button>
      </div>
    );

  const { view } = data;
  // Keluar dari panel penyelamatan: buang `panel=` dari URL supaya banner bisa membukanya lagi.
  const choose = (tab: PanelTab, asset?: Address) => {
    setPicked({ tab, asset });
    if (rescue) router.replace(chainHref(supportedChain(chainId)), { scroll: false });
  };
  // Panel selalu ada di kanan (prototype); baris ditandai setelah user memilihnya dari tabel.
  const pick = (tab: PanelTab) => (asset: Address) => choose(tab, asset);
  const active = (tab: PanelTab) => (picked.tab === tab ? picked.asset : undefined);
  const clickable = (tab: PanelTab) => new Set(panelAssets(view, tab).map((r) => r.asset));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="display text-2xl font-normal">{name}</h2>
        {view.account && <AccountFacts account={view.account} liquidation={liquidationPrice(data.read, WHITELIST[chainId])} />}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {view.account && (
            <PositionTables
              view={view}
              activeSupply={active('withdraw') ?? active('collateral')}
              activeDebt={active('repay')}
              withdrawable={clickable('withdraw')}
              togglable={clickable('collateral')}
              onWithdraw={pick('withdraw')}
              onToggle={pick('collateral')}
              repayable={clickable('repay')}
              onRepay={pick('repay')}
            />
          )}
          <MarketTables
            view={view}
            activeSupply={active('supply')}
            activeBorrow={active('borrow')}
            borrowable={clickable('borrow')}
            onSupply={pick('supply')}
            onBorrow={pick('borrow')}
          />
        </div>
        <div className="xl:sticky xl:top-6">
          {/* Tanpa utang (sudah lunas, atau URL dibuka tanpa posisi) nggak ada yang perlu diselamatkan. */}
          {picked.tab === 'rescue' && view.account?.healthFactor != null ? (
            <RescuePanel chainId={chainId} data={data} onChoose={choose} />
          ) : (
            <ActionPanel
              chainId={chainId}
              data={data}
              tab={picked.tab === 'rescue' ? 'supply' : picked.tab}
              asset={picked.asset}
              onSelect={choose}
              refetch={async () => {
                const result = await refetch();
                // Refetch gagal tetap mengembalikan data lama; izin basi bisa memicu approve dua kali.
                if (result.isError || !result.data) throw result.error ?? new Error('Posisi gagal dibaca ulang');
                return result.data;
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function AccountFacts({ account, liquidation }: { account: AccountView; liquidation: LiqPrice }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <Fact label={POSITION.healthFactor} info={POSITION.hfInfo}>
        <HealthFactor value={account.healthFactor} />
      </Fact>
      {liquidation.kind !== 'noDebt' && (
        <Fact label={POSITION.liquidation} info={POSITION.liquidationInfo}>
          <LiquidationText liq={liquidation} current />
        </Fact>
      )}
      <Fact label={POSITION.available}>
        <span className="num">{usd(account.availableBorrowsUsd)}</span>
      </Fact>
      <Fact label={POSITION.collateral}>
        <span className="num">{usd(account.totalCollateralUsd)}</span>
      </Fact>
      <Fact label={POSITION.debt}>
        <span className="num">{usd(account.totalDebtUsd)}</span>
      </Fact>
      {account.borrowLimitUsed !== null && account.risk !== null && (
        <Fact label={POSITION.used}>
          <span className="flex items-center gap-2">
            <span className="num">{Number.isFinite(account.borrowLimitUsed) ? pct(account.borrowLimitUsed, 0) : POSITION.overLimit}</span>
            <span aria-hidden className="h-1 w-16 overflow-hidden rounded-full bg-line-strong">
              <span
                className={`block h-full ${RISK_BAR[account.risk]}`}
                style={{ width: `${Math.min(account.borrowLimitUsed, 1) * 100}%` }}
              />
            </span>
          </span>
        </Fact>
      )}
    </dl>
  );
}

function Fact({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted" title={info}>
        {label}
        {info && <span className="ml-1 text-[10px] text-faint">ⓘ</span>}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function PositionTables(props: {
  view: ChainView;
  activeSupply: Address | undefined;
  activeDebt: Address | undefined;
  withdrawable: Set<Address>;
  togglable: Set<Address>;
  repayable: Set<Address>;
  onWithdraw: (asset: Address) => void;
  onToggle: (asset: Address) => void;
  onRepay: (asset: Address) => void;
}) {
  const { view } = props;
  return (
    <div className="grid gap-4 2xl:grid-cols-2">
      <FlatTable
        title={TABLE.supplies}
        empty={TABLE.noSupplies}
        rows={view.supplies.map((row) => ({
          key: row.asset,
          symbol: row.symbol,
          note: <AssetNote outside={row.outside} status={row.status} />,
          active: row.asset === props.activeSupply,
          onClick: props.withdrawable.has(row.asset) ? () => props.onWithdraw(row.asset) : undefined,
          cells: [
            <span key="apy" className="num">{pct(row.apy)}</span>,
            <span key="amount" className="num">{tokenAmount(row.amount, row.decimals)}</span>,
            props.togglable.has(row.asset) ? (
              // Switch menunjukkan status sekarang; klik membuka panel penjelasan + HF sesudah, bukan langsung mengubah.
              <button
                key="collateral"
                type="button"
                role="switch"
                aria-checked={row.collateral}
                aria-label={PANEL.collateralTitle(row.symbol)}
                className="switch align-middle"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggle(row.asset);
                }}
              />
            ) : (
              <span key="collateral" className="text-xs text-muted">{row.collateral ? TABLE.collateralOn : TABLE.none}</span>
            ),
          ],
        }))}
        heads={[TABLE.apy, TABLE.balance, TABLE.collateral]}
      />
      <FlatTable
        title={TABLE.borrows}
        empty={TABLE.noBorrows}
        rows={view.borrows.map((row) => ({
          key: row.asset,
          symbol: row.symbol,
          note: <AssetNote outside={row.outside} status={row.status} />,
          active: row.asset === props.activeDebt,
          onClick: props.repayable.has(row.asset) ? () => props.onRepay(row.asset) : undefined,
          cells: [
            <span key="apy" className="num">{pct(row.apy)}</span>,
            <span key="amount" className="num">{tokenAmount(row.amount, row.decimals)}</span>,
          ],
        }))}
        heads={[TABLE.apy, TABLE.debt]}
      />
    </div>
  );
}

function MarketTables(props: {
  view: ChainView;
  activeSupply: Address | undefined;
  activeBorrow: Address | undefined;
  borrowable: Set<Address>;
  onSupply: (asset: Address) => void;
  onBorrow: (asset: Address) => void;
}) {
  const { view } = props;
  const [showAll, setShowAll] = useState(false);
  const connected = view.account !== null;

  return (
    <div className="grid gap-4 2xl:grid-cols-2">
      <FlatTable
        title={TABLE.supplyMarket}
        aside={
          connected && (
            <span className="flex items-center gap-2 text-xs text-muted">
              {TABLE.showAll}
              <button
                type="button"
                role="switch"
                aria-checked={showAll}
                aria-label={TABLE.showAllLabel}
                className="switch"
                onClick={() => setShowAll(!showAll)}
              />
            </span>
          )
        }
        empty={connected ? TABLE.emptyWallet : TABLE.emptyMarket}
        rows={visibleSupplyMarket(view.supplyMarket, showAll).map((row) => ({
          key: row.asset,
          symbol: row.symbol,
          active: row.asset === props.activeSupply,
          onClick: () => props.onSupply(row.asset),
          cells: [
            <span key="apy" className="num">{pct(row.apy)}</span>,
            <span key="wallet" className="num text-muted">
              {row.walletBalance === null ? TABLE.none : tokenAmount(row.walletBalance, row.decimals)}
            </span>,
            <span key="collateral" className="text-xs text-muted">{row.canBeCollateral ? TABLE.collateralYes : TABLE.none}</span>,
          ],
        }))}
        heads={[TABLE.apy, TABLE.wallet, TABLE.collateral]}
      />
      <FlatTable
        title={TABLE.borrowMarket}
        empty={TABLE.emptyMarket}
        rows={view.borrowMarket.map((row) => ({
          key: row.asset,
          symbol: row.symbol,
          active: row.asset === props.activeBorrow,
          onClick: props.borrowable.has(row.asset) ? () => props.onBorrow(row.asset) : undefined,
          cells: [
            <span key="apy" className="num">{pct(row.apy)}</span>,
            <span key="borrowable" className="num text-muted">
              {row.borrowable === null ? TABLE.none : tokenAmount(row.borrowable, row.decimals)}
            </span>,
          ],
        }))}
        heads={[TABLE.apy, TABLE.canBorrow]}
      />
    </div>
  );
}

function AssetNote({ outside, status }: { outside: boolean; status: ReserveStatus }) {
  return (
    <>
      {status !== 'aktif' && (
        <>
          <span className="badge badge-muted">{TABLE[status]}</span>
          <span className="text-xs text-muted">{status === 'dijeda' ? TABLE.dijedaNote : TABLE.dibekukanNote}</span>
        </>
      )}
      {outside && (
        <span className="text-xs text-muted">
          {TABLE.outside}{' '}
          <a className="link" href={AAVE_APP_URL} target="_blank" rel="noreferrer">
            {TABLE.aaveApp}
          </a>
        </span>
      )}
    </>
  );
}

/** Baris tanpa `onClick` belum punya aksi (bukan sekadar nonaktif): kursor biasa, nggak bisa difokus. */
type Row = { key: string; symbol: string; note?: ReactNode; cells: ReactNode[]; active?: boolean; onClick?: () => void };

function FlatTable({ title, aside, heads, rows, empty }: { title: string; aside?: ReactNode; heads: string[]; rows: Row[]; empty: string }) {
  return (
    <div className="surface pt-4">
      <div className="mb-3 flex items-center justify-between px-3">
        <h3 className="font-medium">{title}</h3>
        {aside}
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-line px-3 py-4 text-sm text-muted">{empty}</p>
      ) : (
        <table className="table-flat w-full text-sm">
          <thead>
            <tr>
              <th>{TABLE.asset}</th>
              {heads.map((head) => (
                <th key={head}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                data-active={row.active ?? false}
                className={row.onClick ? '' : '!cursor-default'}
                onClick={row.onClick}
                tabIndex={row.onClick ? 0 : undefined}
                onKeyDown={row.onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), row.onClick?.()) : undefined}
              >
                <td>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <TokenIcon symbol={row.symbol} />
                    <span className="font-medium">{row.symbol}</span>
                    {row.note}
                  </span>
                </td>
                {row.cells.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
