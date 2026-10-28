'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { explorerAddressUrl } from '@/config/explorer';
import type { ChainRead, WhitelistAsset } from '@/core/chainPosition';
import { reserveParameters } from '@/core/reserveParameters';
import { DETAIL, TABLE, TERMS } from '@/copy';
import { pct, price, wholeTokens } from './format';
import { Term } from './Term';
import { TokenIcon } from './TokenIcon';

const OPEN_KEY = 'lending-web:parameterDetailsOpen';

type Props = {
  chainId: number;
  chainName: string;
  read: ChainRead;
  whitelist: WhitelistAsset[];
  /** Label on-chain kategori E-Mode user; `null` = di luar E-Mode. */
  eModeLabel: string | null;
};

// "Detail parameter <chain>" (Q7): angka lengkap reserve untuk user pro, tertutup di tampilan awal; status buka/tutup
// diingat (localStorage) supaya cukup sekali dibuka. Label on-chain kategori E-Mode user cuma di sini (V4).
export function ParameterDetails({ chainId, chainName, read, whitelist, eModeLabel }: Props) {
  const [open, setOpen] = useState(false);
  // Dibaca sesudah mount: server nggak punya localStorage. Storage diblokir (mode privat) = tertutup, nggak diingat.
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === '1');
    } catch {}
  }, []);
  const rows = reserveParameters(read, whitelist);
  const capText = (value: bigint | null) => (value === null ? DETAIL.noCap : wholeTokens(value));

  return (
    <details
      className="surface group"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(OPEN_KEY, next ? '1' : '0');
        } catch {}
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-4 font-medium">
        {DETAIL.title(chainName)}
        <span aria-hidden className="text-faint transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      {eModeLabel !== null && (
        <p className="border-t border-line px-3 py-3 text-xs text-muted">
          {DETAIL.eMode(eModeLabel)} {DETAIL.eModeNote}
        </p>
      )}
      <div className="overflow-x-auto">
        {/* Sembilan kolom angka: jarak antar kolom dilebarkan, tabel digulir mendatar di layar sempit. */}
        <table className="table-flat w-full whitespace-nowrap text-sm [&_td]:pr-6 [&_th]:pr-6">
          <thead>
            <tr>
              <th>{TABLE.asset}</th>
              <Head info={TERMS.ltv}>{DETAIL.ltv}</Head>
              <Head info={TERMS.liquidationThreshold}>{DETAIL.liquidationThreshold}</Head>
              <Head info={TERMS.liquidationPenalty}>{DETAIL.liquidationPenalty}</Head>
              <Head info={TERMS.utilization}>{DETAIL.utilization}</Head>
              <Head info={TERMS.reserveFactor}>{DETAIL.reserveFactor}</Head>
              <Head info={TERMS.supplyCap}>{DETAIL.supplyCap}</Head>
              <Head info={TERMS.borrowCap}>{DETAIL.borrowCap}</Head>
              <Head info={TERMS.oracle}>{DETAIL.oracle}</Head>
              <th>{DETAIL.addresses}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.asset} className="!cursor-default">
                <td>
                  <span className="flex items-center gap-2.5">
                    <TokenIcon symbol={row.symbol} />
                    <span className="font-medium">{row.symbol}</span>
                  </span>
                </td>
                <td className="num">{pct(row.ltv)}</td>
                <td className="num">{pct(row.liquidationThreshold)}</td>
                <td className="num">{row.liquidationPenalty === null ? TABLE.none : pct(row.liquidationPenalty)}</td>
                <td className="num">{pct(row.utilization)}</td>
                <td className="num">{pct(row.reserveFactor)}</td>
                <td className="num">{capText(row.supplyCap)}</td>
                <td className="num">{capText(row.borrowCap)}</td>
                <td className="num">{price(row.priceUsd)}</td>
                <td className="text-xs">
                  <a className="link" href={explorerAddressUrl(chainId, row.asset)} target="_blank" rel="noreferrer">
                    {DETAIL.reserve}
                  </a>{' '}
                  <a className="link" href={explorerAddressUrl(chainId, row.aToken)} target="_blank" rel="noreferrer">
                    {DETAIL.aToken}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Head({ info, children }: { info: string; children: ReactNode }) {
  return (
    <th>
      <Term info={info}>{children}</Term>
    </th>
  );
}
