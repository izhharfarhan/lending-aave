'use client';

import { useEffect, useRef } from 'react';
import type { Address } from 'viem';

import { WHITELIST } from '@/config/assets';
import { chainName, minGasReserve } from '@/config/chains';
import { rescueOptions, type RescueChoice } from '@/core/rescue';
import { PANEL, RESCUE } from '@/copy';
import type { ChainData } from './ActionPanel';
import { tokenAmount } from './format';
import { HealthFactor } from './HealthFactor';
import { TokenIcon } from './TokenIcon';

type Props = {
  chainId: number;
  data: ChainData;
  /** Membuka tab aksi itu dengan jumlah kosong; `asset` kosong = aset pertama tab itu. */
  onChoose: (tab: RescueChoice['tab'], asset?: Address) => void;
};

// Panel penyelamatan (Q29, J3), di tempat panel aksi: Repay atau Supply jaminan, masing-masing dengan HF sesudah MAX-nya
// (modul domain `rescueOptions`). Biaya jaringan belum diketahui di sini, jadi cadangan gas MAX ETH = lantai chain.
export function RescuePanel({ chainId, data, onChoose }: Props) {
  const ref = useRef<HTMLElement>(null);
  // Dibuka dari banner di atas halaman: bawa panelnya ke layar.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const name = chainName(chainId);
  const healthFactorNow = data.view.account?.healthFactor ?? null;
  const options = rescueOptions(data.read, data.view, WHITELIST[chainId], { minGasReserve: minGasReserve(chainId), networkFee: null });

  return (
    <aside ref={ref} aria-labelledby="rescue-title" className="surface flex scroll-mt-6 flex-col gap-4 p-5">
      <div>
        <h3 id="rescue-title" className="text-base font-medium">
          {RESCUE.title(name)}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{RESCUE.intro}</p>
        <p className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">{RESCUE.now}</span>
          <HealthFactor value={healthFactorNow} />
        </p>
      </div>
      <Option
        title={PANEL.tabs.repay}
        note={RESCUE.repayNote}
        choice={options.repay}
        healthFactorNow={healthFactorNow}
        empty={RESCUE.noRepay(name)}
        onChoose={() => onChoose('repay', options.repay?.asset)}
      />
      <Option
        title={RESCUE.supply}
        note={RESCUE.supplyNote}
        choice={options.supply}
        healthFactorNow={healthFactorNow}
        empty={RESCUE.noSupply(name)}
        onChoose={() => onChoose('supply', options.supply?.asset)}
      />
    </aside>
  );
}

type OptionProps = {
  title: string;
  note: string;
  choice: RescueChoice | null;
  healthFactorNow: number | null;
  empty: string;
  onChoose: () => void;
};

function Option(props: OptionProps) {
  const { choice } = props;
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-line p-4">
      <div>
        <p className="font-medium">{props.title}</p>
        <p className="text-xs text-muted">{props.note}</p>
      </div>
      {choice ? (
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{PANEL.amount}</dt>
            <dd className="flex items-center gap-2">
              <TokenIcon symbol={choice.symbol} />
              <span className="num">{RESCUE.using(tokenAmount(choice.amount, choice.decimals), choice.symbol)}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{RESCUE.hfAfter}</dt>
            <dd>
              <HealthFactor value={props.healthFactorNow} withLabel={false} /> <span className="text-faint">{PANEL.arrow}</span>{' '}
              {choice.healthFactor === null ? <span className="text-accent">{RESCUE.paidOff}</span> : <HealthFactor value={choice.healthFactor} />}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted">{props.empty}</p>
      )}
      {/* Dua pilihan setara: tombol netral, blok aksen tetap milik tombol utama panel aksi. */}
      <button type="button" className="btn-ghost px-4 py-2 text-sm font-medium" onClick={props.onChoose}>
        {RESCUE.choose(props.title)}
      </button>
    </section>
  );
}
