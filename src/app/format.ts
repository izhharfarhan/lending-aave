import { formatUnits } from 'viem';

// Format angka gaya Indonesia (koma desimal, titik ribuan), DECISIONS.md Q8.
const nf = (min: number, max: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: min, maximumFractionDigits: max });

// Sen cuma buat nilai kecil; di atas $100 sen cuma bikin angka susah dibaca.
export const usd = (n: number) => {
  const digits = n < 100 ? 2 : 0;
  return `$${nf(digits, digits).format(n)}`;
};
// "Ethereum, Base, dan Arbitrum".
const listFormat = new Intl.ListFormat('id-ID', { type: 'conjunction' });
export const list = (items: string[]) => listFormat.format(items);
export const pct = (n: number, digits = 2) => `${nf(digits, digits).format(n * 100)}%`;
// HF dibulatkan ke BAWAH: 1,996 ditulis 1,99 (Waspada), bukan 2,00 di samping label Waspada. Tampilan nggak pernah
// lebih aman dari kenyataan.
export const hf = (n: number) => nf(2, 2).format(Math.floor(n * 100) / 100);

// Token 18 desimal (ETH dkk.) 4 angka di belakang koma, stablecoin 2. Saldo positif yang terlalu kecil buat
// ditampilkan ditulis "< 0,0001", bukan "0", biar nggak dikira kosong.
export function tokenAmount(amount: bigint, decimals: number): string {
  const digits = decimals >= 18 ? 4 : 2;
  const value = Number(formatUnits(amount, decimals));
  if (amount > 0n && value < 10 ** -digits) return `< ${nf(digits, digits).format(10 ** -digits)}`;
  return nf(0, digits).format(value);
}
