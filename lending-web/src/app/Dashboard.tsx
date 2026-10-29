'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

import { useAllChainViews } from '@/aave/useChainView';
import { useTypicalActionFees } from '@/aave/useNetworkFee';
import { WHITELIST } from '@/config/assets';
import { chainHref, SUPPORTED_CHAINS, type SupportedChain } from '@/config/chains';
import { isDustPosition, RISK_THRESHOLD, type ChainRead, type ChainView, type RiskLevel } from '@/core/chainPosition';
import { liquidationPrice } from '@/core/simulate';
import { elapsed } from '@/core/relativeTime';
import { chainSegment, summarizeChains, type ChainAccount, type DashboardSummary, type UnreadChain } from '@/core/summary';
import { AGE, CHAIN_PICKER, DANGER, DASHBOARD, POSITION, RISK } from '@/copy';
import { ChainIcon } from './ChainIcon';
import { hf, list, pct, tokenAmount, usd } from './format';
import { HealthFactor, RISK_BAR } from './HealthFactor';
import { LiquidationBanner, useLiquidationBanner } from './LiquidationBanner';
import { liquidationText } from './LiquidationText';

type Loaded = { chain: SupportedChain; read: ChainRead; view: ChainView };

const ageText = (seconds: number) => {
  const { amount, unit } = elapsed(seconds);
  return AGE[unit](amount);
};

// Jam perangkat yang diperbarui berkala, untuk umur data yang terus bertambah.
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
// Animasi masuk bertahap (Q20): hero 0 → segmen 1 → tabel 2 (page.tsx).
const stagger = (i: number) => ({ ['--i' as string]: i }) as CSSProperties;

// Ringkasan semua chain (ADR 0001): banner Bahaya menempel di atas hero, lalu segmen per chain yang sekaligus jadi
// pemilih chain (Q5: cuma ganti URL). Chain yang gagal dibaca nggak ikut dijumlah; ringkasan lalu berlabel "Belum lengkap"
// (Q4). Semua chain dibaca ulang tiap ±30 detik dan saat tab difokuskan (useAllChainViews).
export function Dashboard({ selectedChainId }: { selectedChainId: number }) {
  const { isConnected } = useAccount();
  const queries = useAllChainViews();
  const fees = useTypicalActionFees(isConnected);
  // Segmen chain terpilih (mis. dibuka dari banner Bahaya) digeser ke layar di mobile; desktop nggak menggulir.
  const pickerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = pickerRef.current;
    const segment = nav?.querySelector<HTMLElement>(`[data-chain="${selectedChainId}"]`);
    if (nav && segment) nav.scrollTo({
        left: nav.scrollLeft + segment.getBoundingClientRect().left - nav.getBoundingClientRect().left,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
  }, [selectedChainId]);

  // Semua chain yang punya data, termasuk data terakhir chain yang bacaan terbarunya gagal (dipakai banner Bahaya).
  const withData = SUPPORTED_CHAINS.flatMap((chain, i): Loaded[] => {
    const data = queries[i].data;
    return data ? [{ chain, ...data }] : [];
  });
  // "Gagal" = bacaan terakhir error, walau data lama masih ada: sama dengan detail chain, dan ringkasan nggak pernah
  // tampil lengkap dengan data basi (Q4). Banner Bahaya tetap dari data terakhir, dengan umur datanya.
  const failed = (i: number) => queries[i].isError;
  const loaded = withData.filter(({ chain }) => !failed(SUPPORTED_CHAINS.indexOf(chain)));
  const connected = loaded.filter(({ view }) => view.account !== null);
  const unread = SUPPORTED_CHAINS.flatMap((chain, i): UnreadChain[] => {
    if (!failed(i)) return [];
    const account = queries[i].data?.view.account;
    return [{ chainId: chain.chainId, lastRead: account ? { account, readAt: queries[i].dataUpdatedAt } : null }];
  });
  const summary = summarizeChains(
    connected.map(({ chain, view }): ChainAccount => ({ chainId: chain.chainId, account: view.account!, totalSupplyUsd: view.totalSupplyUsd })),
    unread,
  );
  const dataOf = (chainId: number) => withData.find(({ chain }) => chain.chainId === chainId)!;
  const liquidationBanner = useLiquidationBanner();
  const banners = summary.dangerChains.length > 0 || liquidationBanner.liquidations.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="reveal" style={stagger(0)}>
        {isConnected ? (
          <>
            {/* Banner Bahaya lalu banner likuidasi (Q17), menempel di atas hero. */}
            {banners && (
              <div className="divide-y divide-line overflow-hidden rounded-t-[var(--radius)] border border-b-0 border-line">
                <DangerBanner summary={summary} dataOf={dataOf} />
                <LiquidationBanner liquidations={liquidationBanner.liquidations} onDismiss={liquidationBanner.dismiss} />
              </div>
            )}
            <Hero
              attached={banners}
              summary={summary}
              loading={queries.some((q) => q.isLoading)}
              indebted={connected.filter(({ view }) => view.account!.healthFactor !== null && !isDustPosition(view.account!))}
              selectedChainId={selectedChainId}
            />
          </>
        ) : (
          <ConnectHero />
        )}
      </div>
      {/* Mobile: segmen digeser horizontal (segmen berikutnya mengintip di kanan); desktop: tiga kolom. */}
      <nav
        ref={pickerRef}
        aria-label={CHAIN_PICKER.label}
        className="reveal surface flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:grid md:grid-cols-3 md:divide-x md:divide-line md:overflow-hidden"
        style={stagger(1)}
      >
        {SUPPORTED_CHAINS.map((chain, i) => {
          const query = queries[i];
          const ethBalance = query.data?.read.user?.walletBalances[WHITELIST[chain.chainId].find((a) => a.native)!.address] ?? 0n;
          const view = failed(i) ? undefined : query.data?.view;
          const account = view?.account;
          // Seluruh sel bisa diklik lewat `after:` Link nama chain; tombol "Coba lagi" di atasnya (z-10) tetap tombol sendiri.
          return (
            <div
              key={chain.slug}
              data-chain={chain.chainId}
              className={`relative flex flex-col border-line px-5 py-4 transition-colors max-md:w-[82%] max-md:shrink-0 max-md:snap-start max-md:border-r max-md:last:border-r-0 ${
                chain.chainId === selectedChainId ? 'bg-panel-hover shadow-[inset_0_2px_0_var(--accent)]' : 'hover:bg-panel-hover'
              }`}
            >
              <span className="flex w-full items-center gap-2">
                <ChainIcon chainId={chain.chainId} />
                <Link
                  href={chainHref(chain)}
                  aria-current={chain.chainId === selectedChainId ? 'page' : undefined}
                  className="font-medium after:absolute after:inset-0"
                >
                  {chain.name}
                </Link>
                {account &&
                  (account.healthFactor !== null ? (
                    <span className="ml-auto text-lg">
                      <HealthFactor value={account.healthFactor} withLabel={false} />
                    </span>
                  ) : (
                    // Ada supply tanpa utang: "Tidak ada utang", bukan "∞" (Q2). Tanpa posisi sama sekali cukup "Belum ada posisi".
                    view!.supplies.length > 0 && <span className="ml-auto text-xs text-muted">{DASHBOARD.noDebt}</span>
                  ))}
              </span>
              {!isConnected ? (
                <span className="mt-2 text-xs text-muted">{DASHBOARD.connectSegment}</span>
              ) : query.isLoading ? (
                <span className="mt-2 flex flex-col gap-1.5">
                  <span className="skeleton block h-3.5 w-32" />
                  <span className="skeleton block h-1 w-full" />
                </span>
              ) : failed(i) || !query.data ? (
                <span className="mt-2 flex items-center gap-2 text-xs text-danger">
                  {DASHBOARD.failed} ·
                  <button type="button" className="link relative z-10 text-ink" disabled={query.isFetching} onClick={() => query.refetch()}>
                    {query.isFetching ? DASHBOARD.retrying : DASHBOARD.retry}
                  </button>
                </span>
              ) : (
                <SegmentBody chain={chain} read={query.data.read} view={query.data.view} ethBalance={ethBalance} fee={fees[i]} />
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

// Q6: sebelum wallet terhubung, hero berisi ajakan; detail chain di bawah tetap menampilkan aset + APY.
function ConnectHero() {
  const { openConnectModal } = useConnectModal();
  return (
    <HeroFrame>
      <p className="text-sm text-muted">{DASHBOARD.lowestHf}</p>
      <p className="display mt-3 text-[64px] font-extralight leading-[0.95] text-faint md:text-[88px]">{DASHBOARD.unknownHf}</p>
      <p className="mt-5 max-w-sm text-sm text-muted">{DASHBOARD.connectPrompt(list(SUPPORTED_CHAINS.map((c) => c.name)))}</p>
      <button type="button" className="btn-accent mt-4 px-5 py-2.5" onClick={openConnectModal} disabled={!openConnectModal}>
        {DASHBOARD.connect}
      </button>
    </HeroFrame>
  );
}

// Kerangka hero: isi di kiri, separuh kanan pola abstrak statis (kisi titik + garis tipis beraksen, `.hero-pattern`).
// `attached` = banner (Bahaya/likuidasi) menempel di atasnya.
function HeroFrame({ attached = false, children }: { attached?: boolean; children: ReactNode }) {
  return (
    <section className={`surface relative overflow-hidden ${attached ? 'rounded-t-none' : ''}`}>
      <div className="hero-pattern absolute inset-y-0 right-0 hidden w-[52%] md:block" aria-hidden />
      <div className="relative z-10 p-5 md:p-8 md:pr-[46%]">{children}</div>
    </section>
  );
}

function DangerBanner({ summary, dataOf }: { summary: DashboardSummary; dataOf: (chainId: number) => Loaded }) {
  const now = useNow(15_000);
  const [first, ...others] = summary.dangerChains;
  if (first === undefined) return null;
  const { chain, read } = dataOf(first.chainId);
  const liquidation = liquidationText(liquidationPrice(read, WHITELIST[first.chainId]));
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-danger-soft px-5 py-3 text-danger">
      <span className="display text-xs font-medium tracking-wide">{DANGER.tag}</span>
      <ChainIcon chainId={chain.chainId} size={16} />
      <p className="flex-1 text-sm">
        {DANGER.hf(chain.name)} <b className="num">{hf(first.healthFactor)}</b>
        {first.readAt !== null && <span className="text-ink/80"> {DANGER.stale(ageText((now - first.readAt) / 1000))}</span>}.
        {liquidation && <span className="text-ink/80"> {liquidation.text}.</span>}
        {others.length > 0 && <span className="text-ink/80"> {DANGER.more(others.length)}</span>}
      </p>
      {/* Q29: memilih chain itu dan membuka panel penyelamatan (Repay / Supply jaminan), bukan langsung tab Repay.
          Panelnya sendiri yang menggulir ke layar. */}
      <Link href={chainHref(chain, true)} scroll={false} className="text-sm font-medium underline underline-offset-4">
        {DANGER.view(chain.name)}
      </Link>
    </div>
  );
}

// Angka hero aksen kalau Aman; ikut amber/merah kalau Waspada/Bahaya (Q20 "Show the Risk").
const HERO_TONE: Record<RiskLevel, string> = { aman: 'text-accent', waspada: 'text-warn', bahaya: 'text-danger' };

function Hero(props: { attached: boolean; summary: DashboardSummary; loading: boolean; indebted: Loaded[]; selectedChainId: number }) {
  const { summary, loading } = props;
  const lowest = summary.lowestHealthFactor;
  const incomplete = summary.incomplete;
  const unreadNames = incomplete && list(incomplete.unreadChains.map(chainNameOf));
  const money = (n: number) => (loading ? <span className="skeleton mt-1 block h-6 w-24" /> : usd(n));

  return (
    <HeroFrame attached={props.attached}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span title={DASHBOARD.lowestHfInfo}>
          {DASHBOARD.lowestHf}
          <span className="ml-1 text-[10px] text-faint">ⓘ</span>
        </span>
        {!loading && incomplete && <span className="badge badge-warn">{DASHBOARD.incomplete(incomplete.readCount, incomplete.totalCount)}</span>}
      </p>
      {loading ? (
        <span className="skeleton mt-4 block h-14 w-40 md:h-[88px] md:w-72" />
      ) : lowest ? (
        <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-1">
          <p className={`display text-[64px] font-extralight leading-[0.95] tracking-tight md:text-[104px] ${HERO_TONE[lowest.risk]}`}>
            {incomplete && <span className="mr-1 text-[0.5em]">{DASHBOARD.atMost}</span>}
            {hf(lowest.healthFactor)}
          </p>
          <p className="pb-3 text-sm">
            <span className={lowest.risk === 'aman' ? 'text-ink' : HERO_TONE[lowest.risk]}>{RISK[lowest.risk]}</span>
            <span className="text-muted"> · </span>
            <ChainName chainId={lowest.chainId} className="text-muted" />
          </p>
        </div>
      ) : incomplete ? (
        // Chain yang terbaca tanpa utang, tapi chain yang gagal bisa saja punya utang: jangan tulis "Tidak ada utang".
        <p className="display mt-3 text-[64px] font-extralight leading-[0.95] text-faint md:text-[88px]">{DASHBOARD.unknownHf}</p>
      ) : (
        <p className="display mt-4 mb-6 text-4xl font-extralight text-muted md:text-5xl">{POSITION.noDebt}</p>
      )}
      {!loading && unreadNames && (
        <p className="mt-2 text-xs text-warn">{lowest ? DASHBOARD.hfMayBeLower(unreadNames) : DASHBOARD.mayHaveDebt(unreadNames)}</p>
      )}
      {!loading && lowest && (
        <div className="mt-5">
          <HfScale indebted={props.indebted} selectedChainId={props.selectedChainId} />
        </div>
      )}
      <dl className="mt-2 grid max-w-[560px] grid-cols-3">
        <Stat label={DASHBOARD.totalSupply} first>
          {money(summary.totalSupplyUsd)}
        </Stat>
        <Stat label={DASHBOARD.totalDebt}>{money(summary.totalDebtUsd)}</Stat>
        <Stat label={DASHBOARD.net}>{money(summary.netUsd)}</Stat>
      </dl>
      {!loading && summary.highestBorrowLimitUsed && (
        <BorrowLimitBar top={summary.highestBorrowLimitUsed} note={unreadNames ? DASHBOARD.limitMayBeHigher(unreadNames) : null} />
      )}
    </HeroFrame>
  );
}

const chainNameOf = (chainId: number) => SUPPORTED_CHAINS.find((c) => c.chainId === chainId)!.name;

// Nama chain dalam kalimat, didahului logonya (tiket 27).
function ChainName({ chainId, className }: { chainId: number; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 align-[-2px] ${className}`}>
      <ChainIcon chainId={chainId} size={14} />
      {chainNameOf(chainId)}
    </span>
  );
}

// Posisi HF di skala 1,0 → 3,0+ dalam persen lebar skala; HF di atas 3 menempel di ujung kanan.
const SCALE_MAX = 3;
const scalePct = (value: number) => ((Math.min(Math.max(value, 1), SCALE_MAX) - 1) / (SCALE_MAX - 1)) * 100;
const SCALE_TICKS = DASHBOARD.scaleTicks;

// Satu baris label di atas skala. Label yang bakal bertumpuk digabung jadi satu, urut HF dari kiri
// ("Base 1,38 · Arbitrum 1,44"), diletakkan di tengah batang-batangnya dan dijaga tetap di dalam skala. Lebar label
// diperkirakan dari jumlah huruf (11px, IBM Plex Sans).
const LABEL_HEIGHT = 16;
const CHAR_WIDTH = 6.4;
const LABEL_GAP = 8;

type Marker = Loaded & { value: number; x: number };
type LabelGroup = { markers: Marker[]; left: number };

function groupLabels(indebted: Loaded[], scaleWidth: number): LabelGroup[] {
  const markers = indebted
    .map((loaded) => {
      const value = loaded.view.account!.healthFactor!;
      return { ...loaded, value, x: (scalePct(value) / 100) * scaleWidth };
    })
    .sort((a, b) => a.value - b.value);
  const textLength = (group: Marker[]) =>
    group.reduce((n, m) => n + m.chain.name.length + 5, 0) + (group.length - 1) * DASHBOARD.markerJoin.length;
  const widthOf = (group: Marker[]) => textLength(group) * CHAR_WIDTH;
  const leftOf = (group: Marker[]) => {
    const center = group.reduce((sum, m) => sum + m.x, 0) / group.length;
    return Math.min(Math.max(center - widthOf(group) / 2, 0), Math.max(scaleWidth - widthOf(group), 0));
  };
  // Gabung kelompok bertetangga yang labelnya bertumpuk sampai nggak ada lagi; tiap gabungan mengurangi jumlah kelompok.
  const groups = markers.map((m) => [m]);
  for (let i = 0; i < groups.length - 1; ) {
    if (leftOf(groups[i]) + widthOf(groups[i]) + LABEL_GAP > leftOf(groups[i + 1])) {
      groups.splice(i, 2, [...groups[i], ...groups[i + 1]]);
      i = 0;
    } else i++;
  }
  return groups.map((group) => ({ markers: group, left: leftOf(group) }));
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
  const groups = groupLabels(indebted, width);
  const barTop = LABEL_HEIGHT + 12;
  return (
    <div ref={ref} className="relative max-w-[520px] pb-9" style={{ paddingTop: barTop }}>
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
          style={{ left: `${scalePct(tick)}%`, top: barTop + 10 }}
        >
          {label}
          {tick === 1 && <span className="block font-sans">{DASHBOARD.liquidationTick}</span>}
        </span>
      ))}
      {groups.map(({ markers, left }) => (
        <span key={markers[0].chain.slug} className="absolute whitespace-nowrap text-[11px] leading-4" style={{ left, top: 0 }}>
          {markers.map(({ chain, value }, i) => {
            const active = chain.chainId === selectedChainId;
            return (
              <Fragment key={chain.slug}>
                {i > 0 && <span className="text-faint">{DASHBOARD.markerJoin}</span>}
                <Link
                  href={chainHref(chain)}
                  aria-label={DASHBOARD.marker(chain.name, hf(value))}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'text-accent' : 'text-muted hover:text-ink'}
                >
                  {chain.name} <span className="num">{hf(value)}</span>
                </Link>
              </Fragment>
            );
          })}
        </span>
      ))}
      {groups.flatMap(({ markers }) => markers).map(({ chain, x }) => (
        <span
          key={chain.slug}
          aria-hidden
          className={`absolute w-[3px] -translate-x-1/2 rounded-full ${chain.chainId === selectedChainId ? 'bg-accent' : 'bg-ink'}`}
          style={{ left: x, top: LABEL_HEIGHT + 2, height: barTop - LABEL_HEIGHT + 2 }}
        />
      ))}
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

function BorrowLimitBar({ top, note }: { top: NonNullable<DashboardSummary['highestBorrowLimitUsed']>; note: string | null }) {
  return (
    <div className="mt-7 max-w-[520px]">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted" title={DASHBOARD.limitInfo}>
          {DASHBOARD.limitUsed} <ChainName chainId={top.chainId} className="text-ink" />{' '}
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
      {note && <p className="mt-1.5 text-xs text-warn">{note}</p>}
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

  const dust = isDustPosition(account);
  const liquidation = account.risk === 'bahaya' && !dust ? liquidationText(liquidationPrice(read, WHITELIST[chain.chainId])) : null;
  return (
    <span className="mt-2 flex flex-col">
      <span className="num text-xs text-muted">{DASHBOARD.supplyDebt(usd(view.totalSupplyUsd), usd(account.totalDebtUsd))}</span>
      <span aria-hidden className="mt-2 block h-[2px] rounded-full bg-line-strong">
        {account.borrowLimitUsed !== null && account.risk !== null && (
          <span className={`block h-full rounded-full ${RISK_BAR[account.risk]}`} style={{ width: usedWidth(account.borrowLimitUsed) }} />
        )}
      </span>
      {liquidation && <span className={`mt-2 text-xs ${liquidation.tone}`}>{liquidation.text}</span>}
      {dust && <span className="mt-2 text-xs text-muted">{POSITION.dust}</span>}
      {badge}
    </span>
  );
}

