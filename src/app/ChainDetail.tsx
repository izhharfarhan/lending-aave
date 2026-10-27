'use client';

import { useState, type ReactNode } from 'react';

import { useChainView } from '@/aave/useChainView';
import { chainName } from '@/config/chains';
import {
  visibleSupplyMarket,
  type AccountView,
  type ChainView,
  type ReserveStatus,
  type RiskLevel,
} from '@/core/chainPosition';
import { POSITION, RISK, TABLE } from '@/copy';
import { hf, pct, tokenAmount, usd } from './format';

const AAVE_APP_URL = 'https://app.aave.com/';

// Detail chain terpilih (Q20, prototype): kepala HF + sisa batas pinjam, lalu empat tabel datar. Baris belum bisa
// diklik; panel aksi menyusul di tiket 03.
export function ChainDetail({ chainId }: { chainId: number }) {
  const { data: view, isPending, isError, refetch } = useChainView(chainId);
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
        {POSITION.failed(name)}{' '}
        <button type="button" className="link text-ink" onClick={() => refetch()}>
          {POSITION.retry}
        </button>
      </div>
    );

  return (
    <section className="reveal flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="display text-2xl font-normal">{name}</h2>
        {view.account && <AccountFacts account={view.account} />}
      </div>
      {view.account && <PositionTables view={view} />}
      <MarketTables view={view} />
    </section>
  );
}

// Aman = netral; cuma Waspada/Bahaya yang berwarna (Q20).
const RISK_TONE: Record<RiskLevel, string> = { aman: 'text-ink', waspada: 'text-warn', bahaya: 'text-danger' };
const RISK_BAR: Record<RiskLevel, string> = { aman: 'bg-muted', waspada: 'bg-warn', bahaya: 'bg-danger' };

function AccountFacts({ account }: { account: AccountView }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <Fact label={POSITION.healthFactor} info={POSITION.hfInfo}>
        {account.healthFactor === null || account.risk === null ? (
          <span className="text-muted">{POSITION.noDebt}</span>
        ) : (
          <span className={RISK_TONE[account.risk]}>
            <span className="num">{hf(account.healthFactor)}</span>
            <span className="ml-1.5 text-[0.85em] opacity-80">{RISK[account.risk]}</span>
          </span>
        )}
      </Fact>
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

function PositionTables({ view }: { view: ChainView }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <FlatTable
        title={TABLE.supplies}
        empty={TABLE.noSupplies}
        rows={view.supplies.map((row) => ({
          key: row.asset,
          symbol: row.symbol,
          note: <AssetNote outside={row.outside} status={row.status} />,
          cells: [
            <span key="apy" className="num">{pct(row.apy)}</span>,
            <span key="amount" className="num">{tokenAmount(row.amount, row.decimals)}</span>,
            <span key="collateral" className="text-xs text-muted">{row.collateral ? TABLE.collateralOn : TABLE.none}</span>,
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

function MarketTables({ view }: { view: ChainView }) {
  const [showAll, setShowAll] = useState(false);
  const connected = view.account !== null;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
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
      {status !== 'aktif' && <span className="badge badge-muted">{TABLE[status]}</span>}
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

type Row = { key: string; symbol: string; note?: ReactNode; cells: ReactNode[] };

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
              <tr key={row.key} className="!cursor-default">
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

const TOKEN_COLOR: Record<string, string> = { ETH: '--tok-eth', USDC: '--tok-usdc', USDT: '--tok-usdt', wstETH: '--tok-wsteth' };

// Logo token = inisial di lingkaran berwarna (Q20), tanpa aset bermerek.
function TokenIcon({ symbol, size = 22 }: { symbol: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `var(${TOKEN_COLOR[symbol] ?? '--tok-other'})` }}
    >
      {symbol === 'ETH' ? 'E' : symbol.slice(0, 2)}
    </span>
  );
}
