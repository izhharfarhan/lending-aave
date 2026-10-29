'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { LogoFile } from '@/config/tokenLogos';

// Logo dari file lokal (token tiket 26, chain tiket 27). Nggak ada logo, atau file gagal dimuat, → `fallback` (inisial),
// jadi nggak pernah tampil gambar rusak. `plate` = alas terang untuk logo yang bukan bidang penuh (berlian ETH).
export function LogoMark({ logo, alt, size, rounded, fallback }: { logo: LogoFile | null; alt: string; size: number; rounded: string; fallback: ReactNode }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  // Gambar dari HTML server bisa sudah gagal sebelum hydration, dan `onError`-nya nggak pernah terpanggil. Yang sudah
  // selesai dimuat dicek ulang lewat `decode()` (menolak kalau rusak; `naturalWidth` nggak bisa dipakai: SVG tanpa ukuran
  // bisa 0 di sebagian browser).
  const src = logo?.src;
  useEffect(() => {
    const el = img.current;
    if (src && el?.complete) el.decode().catch(() => setFailedSrc(src));
  }, [src]);
  if (!logo || failedSrc === logo.src) return fallback;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${rounded}`}
      style={{ width: size, height: size, background: logo.plate ? 'var(--tok-plate)' : undefined }}
    >
      <img
        ref={img}
        src={logo.src}
        alt={alt}
        width={size}
        height={size}
        className={logo.plate ? 'h-[72%] w-[72%] object-contain' : 'h-full w-full object-contain'}
        onError={() => setFailedSrc(logo.src)}
      />
    </span>
  );
}
