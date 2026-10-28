import { formatUnits } from 'viem';

// Format angka gaya Indonesia (koma desimal, titik ribuan), DECISIONS.md Q8.
const nf = (min: number, max: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: min, maximumFractionDigits: max });

// Sen cuma buat nilai kecil; di atas $100 sen cuma bikin angka susah dibaca. Nilai yang nggak sampai satu sen (posisi
// debu) ditulis "< $0,01", bukan "$0,00" yang terbaca kosong. Tanda minus di depan "$" (net negatif).
export const usd = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs < 100 ? 2 : 0;
  const sign = n < 0 ? '−' : '';
  return abs > 0 && abs < 0.005 ? `${sign}< $0,01` : `${sign}$${nf(digits, digits).format(abs)}`;
};
// Harga oracle: harga di bawah $10 (stablecoin) butuh 4 desimal, $0,9998 bukan $1,00.
export const price = (n: number) => `$${(n < 10 ? nf(2, 4) : nf(2, 2)).format(n)}`;
// Jumlah token utuh (supply/borrow cap).
export const wholeTokens = (n: bigint) => nf(0, 0).format(n);
// "Ethereum, Base, dan Arbitrum".
const listFormat = new Intl.ListFormat('id-ID', { type: 'conjunction' });
export const list = (items: string[]) => listFormat.format(items);
export const pct = (n: number, digits = 2) => `${nf(digits, digits).format(n * 100)}%`;
// HF dibulatkan ke BAWAH: 1,996 ditulis 1,99 (Waspada), bukan 2,00 di samping label Waspada. Tampilan nggak pernah
// lebih aman dari kenyataan. Mulai 100 cukup "> 100": angka sebesar itu (mis. sisa debu bunga sesudah repay) nggak
// berarti apa-apa lagi.
const HF_DISPLAY_CAP = 100;
export const hf = (n: number) => (n >= HF_DISPLAY_CAP ? `> ${HF_DISPLAY_CAP}` : nf(2, 2).format(Math.floor(n * 100) / 100));

// Token 18 desimal (ETH dkk.) 4 angka di belakang koma, stablecoin 2. Saldo positif yang terlalu kecil buat
// ditampilkan ditulis "< 0,0001", bukan "0", biar nggak dikira kosong.
export function tokenAmount(amount: bigint, decimals: number): string {
  const digits = decimals >= 18 ? 4 : 2;
  const value = Number(formatUnits(amount, decimals));
  if (amount > 0n && value < 10 ** -digits) return `< ${nf(digits, digits).format(10 ** -digits)}`;
  return nf(0, digits).format(value);
}

/** Alamat/hash dipendekkan: `0x1234…abcd`. */
export const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

// "27 Okt 2026, 12.38", jam perangkat. Dipakai untuk waktu kejadian dari timestamp blok (banner likuidasi).
const dateTimeFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const dateTime = (unixSeconds: number) => dateTimeFormat.format(new Date(unixSeconds * 1000));
