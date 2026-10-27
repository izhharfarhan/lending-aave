'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useAccount } from 'wagmi';

import { useAllChainViews } from '@/aave/useChainView';
import { useTypicalActionFees } from '@/aave/useNetworkFee';
import { WHITELIST } from '@/config/assets';
import { SUPPORTED_CHAINS, type SupportedChain } from '@/config/chains';
import { RISK_THRESHOLD, type ChainRead, type ChainView, type RiskLevel } from '@/core/chainPosition';
import { liquidationPrice } from '@/core/simulate';
import { chainSegment, summarizeChains, type ChainAccount, type DashboardSummary } from '@/core/summary';
import { CHAIN_PICKER, DANGER, DASHBOARD, POSITION, RISK } from '@/copy';
import { hf, pct, tokenAmount, usd } from './format';
import { HealthFactor, RISK_BAR } from './HealthFactor';
import { liquidationText } from './LiquidationText';

type Loaded = { chain: SupportedChain; read: ChainRead; view: ChainView };

const hrefOf = (chain: SupportedChain) => `/?chain=${chain.slug}`;
// Animasi masuk bertahap (Q20): hero 0 → segmen 1 → tabel 2 (page.tsx).
const stagger = (i: number) => ({ ['--i' as string]: i }) as CSSProperties;

// Ringkasan semua chain (ADR 0001): banner Bahaya menempel di atas hero, lalu segmen per chain yang sekaligus jadi
// pemilih chain (Q5: cuma ganti URL). Chain yang gagal atau belum terbaca nggak ikut ringkasan; labelnya di tiket 12.
export function Dashboard({ selectedChainId }: { selectedChainId: number }) {
  const { isConnected } = useAccount();
  const queries = useAllChainViews();
  const fees = useTypicalActionFees(isConnected);

  const loaded = SUPPORTED_CHAINS.flatMap((chain, i): Loaded[] => {
    const data = queries[i].data;
    return data ? [{ chain, ...data }] : [];
  });
  const connected = loaded.filter(({ view }) => view.account !== null);
  const summary = summarizeChains(
    connected.map(({ chain, view }): ChainAccount => ({ chainId: chain.chainId, account: view.account!, totalSupplyUsd: view.totalSupplyUsd })),
  );
  const loadedOf = (chainId: number) => loaded.find(({ chain }) => chain.chainId === chainId)!;

  return (
    <div className="flex flex-col gap-4">
      {isConnected && (
        <div className="reveal" style={stagger(0)}>
          <DangerBanner summary={summary} loadedOf={loadedOf} />
          <Hero
            summary={summary}
            loading={queries.some((q) => q.isLoading)}
            indebted={connected.filter(({ view }) => view.account!.healthFactor !== null)}
            selectedChainId={selectedChainId}
          />
        </div>
      )}
      <nav aria-label={CHAIN_PICKER.label} className="reveal surface grid overflow-hidden md:grid-cols-3 md:divide-x md:divide-line" style={stagger(1)}>
        {SUPPORTED_CHAINS.map((chain, i) => {
          const query = queries[i];
          const ethBalance = query.data?.read.user?.walletBalances[WHITELIST[chain.chainId].find((a) => a.native)!.address] ?? 0n;
          return (
            <Link
              key={chain.slug}
              href={hrefOf(chain)}
              aria-current={chain.chainId === selectedChainId ? 'page' : undefined}
              className={`flex flex-col border-line px-5 py-4 transition-colors max-md:border-b max-md:last:border-b-0 ${
                chain.chainId === selectedChainId ? 'bg-panel-hover shadow-[inset_0_2px_0_var(--accent)]' : 'hover:bg-panel-hover'
              }`}
            >
              <span className="flex w-full items-center gap-2">
                <ChainIcon chain={chain} />
                <span className="font-medium">{chain.name}</span>
                {query.data?.view.account &&
                  (query.data.view.account.healthFactor !== null ? (
                    <span className="ml-auto text-lg">
                      <HealthFactor value={query.data.view.account.healthFactor} withLabel={false} />
                    </span>
                  ) : (
                    // Ada supply tanpa utang: "Tidak ada utang", bukan "∞" (Q2). Tanpa posisi sama sekali cukup "Belum ada posisi".
                    query.data.view.supplies.length > 0 && <span className="ml-auto text-xs text-muted">{DASHBOARD.noDebt}</span>
                  ))}
              </span>
              {isConnected &&
                (query.isLoading ? (
                  <span className="mt-2 flex flex-col gap-1.5">
                    <span className="skeleton block h-3.5 w-32" />
                    <span className="skeleton block h-1 w-full" />
                  </span>
                ) : query.data ? (
                  <SegmentBody chain={chain} read={query.data.read} view={query.data.view} ethBalance={ethBalance} fee={fees[i]} />
                ) : (
                  <span className="mt-2 text-xs text-danger">{DASHBOARD.failed}</span>
                ))}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function DangerBanner({
  summary,
  loadedOf,
}: {
  summary: DashboardSummary;
  loadedOf: (chainId: number) => Loaded;
}) {
  const [firstId, ...others] = summary.dangerChains;
  if (firstId === undefined) return null;
  const { chain, read, view } = loadedOf(firstId);
  const liquidation = liquidationText(liquidationPrice(read, WHITELIST[firstId]));
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-t-[var(--radius)] border border-b-0 border-line bg-danger-soft px-5 py-3 text-danger"
    >
      <span className="display text-xs font-medium tracking-wide">{DANGER.tag}</span>
      <p className="flex-1 text-sm">
        {DANGER.hf(chain.name)} <b className="num">{hf(view.account!.healthFactor!)}</b>.
        {liquidation && <span className="text-ink/80"> {liquidation.text}.</span>}
        {others.length > 0 && <span className="text-ink/80"> {DANGER.more(others.length)}</span>}
      </p>
      {/* Panel penyelamatan (Repay / Supply jaminan) menyusul di tiket 13; sementara cuma memilih chain itu. */}
      <Link href={hrefOf(chain)} className="text-sm font-medium underline underline-offset-4">
        {DANGER.view(chain.name)}
      </Link>
    </div>
  );
}

// Angka hero aksen kalau Aman; ikut amber/merah kalau Waspada/Bahaya (Q20 "Show the Risk").
const HERO_TONE: Record<RiskLevel, string> = { aman: 'text-accent', waspada: 'text-warn', bahaya: 'text-danger' };

function Hero(props: { summary: DashboardSummary; loading: boolean; indebted: Loaded[]; selectedChainId: number }) {
  const { summary, loading } = props;
  const lowest = summary.lowestHealthFactor;
  const money = (n: number) => (loading ? <span className="skeleton mt-1 block h-6 w-24" /> : usd(n));

  return (
    <section className={`surface relative overflow-hidden ${summary.dangerChains.length > 0 ? 'rounded-t-none' : ''}`}>
      <div className="absolute inset-y-0 right-0 hidden w-[46%] md:block" aria-hidden>
        <div className="portal-scene">
          <div className="portal-floor" />
          <div className="portal-rock left" />
          <div className="portal-reflection" />
          <div className="portal-door" />
          <div className="portal-rock right" />
        </div>
      </div>
      <div className="relative z-10 p-5 md:p-8 md:pr-[46%]">
        <p className="text-sm text-muted" title={DASHBOARD.lowestHfInfo}>
          {DASHBOARD.lowestHf}
          <span className="ml-1 text-[10px] text-faint">ⓘ</span>
        </p>
        {loading ? (
          <span className="skeleton mt-4 block h-14 w-40 md:h-[88px] md:w-72" />
        ) : lowest ? (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-1">
              <p className={`display text-[64px] font-extralight leading-[0.95] tracking-tight md:text-[104px] ${HERO_TONE[lowest.risk]}`}>
                {hf(lowest.healthFactor)}
              </p>
              <p className="pb-3 text-sm">
                <span className={lowest.risk === 'aman' ? 'text-ink' : HERO_TONE[lowest.risk]}>{RISK[lowest.risk]}</span>
                <span className="text-muted"> · {chainNameOf(lowest.chainId)}</span>
              </p>
            </div>
            <HfScale indebted={props.indebted} selectedChainId={props.selectedChainId} />
          </>
        ) : (
          <p className="display mt-4 mb-6 text-4xl font-extralight text-muted md:text-5xl">{POSITION.noDebt}</p>
        )}

        <dl className="mt-2 grid max-w-[560px] grid-cols-3">
          <Stat label={DASHBOARD.totalSupply} first>
            {money(summary.totalSupplyUsd)}
          </Stat>
          <Stat label={DASHBOARD.totalDebt}>{money(summary.totalDebtUsd)}</Stat>
          <Stat label={DASHBOARD.net}>{money(summary.netUsd)}</Stat>
        </dl>
        {!loading && summary.highestBorrowLimitUsed && <BorrowLimitBar top={summary.highestBorrowLimitUsed} />}
      </div>
    </section>
  );
}

const chainNameOf = (chainId: number) => SUPPORTED_CHAINS.find((c) => c.chainId === chainId)!.name;

// Posisi HF di skala 1,0 → 3,0+ dalam persen lebar skala; HF di atas 3 menempel di ujung kanan.
const SCALE_MAX = 3;
const scalePct = (value: number) => ((Math.min(Math.max(value, 1), SCALE_MAX) - 1) / (SCALE_MAX - 1)) * 100;
const SCALE_TICKS = DASHBOARD.scaleTicks;

// Label penanda berakhir di batangnya (memanjang ke kiri), urut HF dari kiri. Tiap label ditaruh di baris terendah yang
// nggak menabrak label lain di baris itu dan nggak ditembus batang penanda di baris atasnya (batang turun melewati baris
// bawah). Penanda di kiri selalu sudah ditempatkan, jadi batang baru nggak pernah menembus label baris bawah, kecuali
// label yang mentok di tepi kiri skala (HF dekat 1,0). Lebar label diperkirakan dari jumlah huruf (11px, IBM Plex Sans).
const ROW_HEIGHT = 16;
const CHAR_WIDTH = 6.4;
const LABEL_GAP = 8;

type Marker = Loaded & { value: number; x: number; left: number; width: number; row: number };

function placeMarkers(indebted: Loaded[], scaleWidth: number): Marker[] {
  const placed: Marker[] = [];
  const sorted = indebted
    .map((loaded) => ({ ...loaded, value: loaded.view.account!.healthFactor! }))
    .sort((a, b) => a.value - b.value);
  for (const marker of sorted) {
    const x = (scalePct(marker.value) / 100) * scaleWidth;
    const width = (marker.chain.name.length + 5) * CHAR_WIDTH;
    const left = Math.max(x - width - 4, 0);
    const clashes = (row: number) =>
      placed.some((other) =>
        other.row === row
          ? left < other.left + other.width + LABEL_GAP && other.left < left + width + LABEL_GAP
          : other.row > row && other.x >= left - LABEL_GAP && other.x <= left + width + LABEL_GAP,
      );
    // Berhenti: baris di atas penanda tertinggi selalu kosong.
    let row = 0;
    while (clashes(row)) row++;
    placed.push({ ...marker, x, left, width, row });
  }
  return placed;
}

function useWidth<T extends HTMLElement>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function HfScale({ indebted, selectedChainId }: { indebted: Loaded[]; selectedChainId: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(520);
  const markers = placeMarkers(indebted, width);
  const rows = Math.max(1, ...markers.map((m) => m.row + 1));
  const labelsHeight = rows * ROW_HEIGHT;
  return (
    <div ref={ref} className="relative mt-5 max-w-[520px] pb-9" style={{ paddingTop: labelsHeight + 12 }}>
      <div className="relative h-[3px] rounded-full bg-line-strong">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-danger" style={{ width: `${scalePct(RISK_THRESHOLD.waspada)}%` }} />
        <span
          className="absolute inset-y-0 bg-warn"
          style={{ left: `${scalePct(RISK_THRESHOLD.waspada)}%`, width: `${scalePct(RISK_THRESHOLD.aman) - scalePct(RISK_THRESHOLD.waspada)}%` }}
        />
      </div>
      {SCALE_TICKS.map(([tick, label], i) => (
        <span
          key={tick}
          className={`num absolute text-[10px] text-faint ${i === 0 ? '' : i === SCALE_TICKS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
          style={{ left: `${scalePct(tick)}%`, top: labelsHeight + 22 }}
        >
          {label}
          {tick === 1 && <span className="block font-sans">{DASHBOARD.liquidationTick}</span>}
        </span>
      ))}
      {markers.map(({ chain, value, x, left, row }) => {
        const active = chain.chainId === selectedChainId;
        // Baris 0 paling dekat skala; batang dari bawah label sampai skala.
        const labelTop = (rows - 1 - row) * ROW_HEIGHT;
        return (
          <Fragment key={chain.slug}>
            <Link
              href={hrefOf(chain)}
              aria-label={DASHBOARD.marker(chain.name, hf(value))}
              aria-current={active ? 'page' : undefined}
              className={`absolute whitespace-nowrap text-[11px] leading-4 ${active ? 'text-accent' : 'text-muted hover:text-ink'}`}
              style={{ left, top: labelTop }}
            >
              {chain.name} <span className="num">{hf(value)}</span>
            </Link>
            <span
              aria-hidden
              className={`absolute w-[3px] -translate-x-1/2 rounded-full ${active ? 'bg-accent' : 'bg-ink'}`}
              style={{ left: x, top: labelTop + ROW_HEIGHT + 2, height: labelsHeight + 12 - (labelTop + ROW_HEIGHT + 2) + 4 }}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function Stat({ label, children, first = false }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={first ? 'pr-3 md:pr-6' : 'border-l border-line px-3 md:px-6'}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="display mt-1.5 text-base font-light tracking-tight md:text-[21px]">{children}</dd>
    </div>
  );
}

// Lebar bar dipotong di 100%; ∞ (utang dengan jaminan LTV 0) ditulis "> 100%".
const usedText = (used: number) => (Number.isFinite(used) ? pct(used, 0) : POSITION.overLimit);
const usedWidth = (used: number) => `${Math.min(used, 1) * 100}%`;

function BorrowLimitBar({ top }: { top: NonNullable<DashboardSummary['highestBorrowLimitUsed']> }) {
  return (
    <div className="mt-7 max-w-[520px]">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted" title={DASHBOARD.limitInfo}>
          {DASHBOARD.limitUsed} <span className="text-ink">{chainNameOf(top.chainId)}</span>{' '}
          <span className="num text-ink">{usedText(top.used)}</span>
          <span className="ml-1 text-[10px] text-faint">ⓘ</span>
        </span>
        <span className="shrink-0 text-muted">
          {DASHBOARD.remaining} <span className="num text-ink">{usd(top.availableUsd)}</span>
        </span>
      </div>
      <div className="relative mt-2 h-[3px] rounded-full bg-line-strong">
        <span className={`absolute inset-y-0 left-0 rounded-full ${RISK_BAR[top.risk]}`} style={{ width: usedWidth(top.used) }} />
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg ${RISK_BAR[top.risk]}`}
          style={{ left: usedWidth(top.used) }}
        />
      </div>
    </div>
  );
}

function SegmentBody({ chain, read, view, ethBalance, fee }: Loaded & { ethBalance: bigint; fee: bigint | null }) {
  const account = view.account;
  if (!account) return null;
  const segment = chainSegment(view, { ethBalance, typicalActionFee: fee });
  const badge = segment.ethShort && <span className="badge badge-danger mt-2 self-start">{DASHBOARD.ethShort}</span>;

  if (segment.kind === 'empty')
    return (
      <span className="mt-2 flex flex-col text-xs">
        <span className="text-muted">{DASHBOARD.noPosition}</span>
        {segment.largestWallet && (
          <span className="mt-0.5 text-ink/80">
            {DASHBOARD.canSupply(`${tokenAmount(segment.largestWallet.amount, segment.largestWallet.decimals)} ${segment.largestWallet.symbol}`)}
          </span>
        )}
        {badge}
      </span>
    );

  const liquidation = account.risk === 'bahaya' ? liquidationText(liquidationPrice(read, WHITELIST[chain.chainId])) : null;
  return (
    <span className="mt-2 flex flex-col">
      <span className="num text-xs text-muted">{DASHBOARD.supplyDebt(usd(view.totalSupplyUsd), usd(account.totalDebtUsd))}</span>
      <span aria-hidden className="mt-2 block h-[2px] rounded-full bg-line-strong">
        {account.borrowLimitUsed !== null && account.risk !== null && (
          <span className={`block h-full rounded-full ${RISK_BAR[account.risk]}`} style={{ width: usedWidth(account.borrowLimitUsed) }} />
        )}
      </span>
      {liquidation && <span className={`mt-2 text-xs ${liquidation.tone}`}>{liquidation.text}</span>}
      {badge}
    </span>
  );
}

function ChainIcon({ chain }: { chain: SupportedChain }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-[var(--chain-ink)]"
      style={{ background: `var(--chain-${chain.slug})` }}
    >
      {chain.name[0]}
    </span>
  );
}
