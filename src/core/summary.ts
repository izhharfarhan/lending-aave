import type { AccountView, ChainView, RiskLevel } from './chainPosition';

/** Satu chain yang berhasil dibaca dengan wallet terhubung: `account` + `totalSupplyUsd` dari `ChainView`. */
export type ChainAccount = { chainId: number; account: AccountView; totalSupplyUsd: number };

export type DashboardSummary = {
  /** `null` = tidak ada utang di chain mana pun. */
  lowestHealthFactor: { chainId: number; healthFactor: number; risk: RiskLevel } | null;
  /** USD harga oracle Aave; saldo wallet nggak ikut (Q3). */
  totalSupplyUsd: number;
  totalDebtUsd: number;
  netUsd: number;
  /**
   * Batas pinjam terpakai chain yang paling dekat batasnya (Q24), `availableUsd` = sisa batas pinjam chain itu, `risk` =
   * tier HF chain itu (warna bar). `used` bisa ∞ (utang dengan jaminan LTV 0). `null` = tidak ada utang (bar disembunyikan).
   */
  highestBorrowLimitUsed: { chainId: number; used: number; availableUsd: number; risk: RiskLevel } | null;
  /** Chain Bahaya (HF < 1,5), HF terendah dulu: banner menyebut yang pertama lalu "+N chain lain" (Q2). */
  dangerChains: number[];
};

// Ringkasan semua chain untuk hero (ADR 0001, Q3).
export function summarizeChains(chains: ChainAccount[]): DashboardSummary {
  // Chain tanpa utang nggak punya HF, jadi nggak ikut HF terendah (Q3).
  const byHealth = chains
    .flatMap(({ chainId, account }) =>
      account.healthFactor !== null && account.risk !== null ? [{ chainId, healthFactor: account.healthFactor, risk: account.risk }] : [],
    )
    .sort((a, b) => a.healthFactor - b.healthFactor);
  const highest = chains.reduce<DashboardSummary['highestBorrowLimitUsed']>(
    (top, { chainId, account }) =>
      account.borrowLimitUsed !== null && account.risk !== null && (top === null || account.borrowLimitUsed > top.used)
        ? { chainId, used: account.borrowLimitUsed, availableUsd: account.availableBorrowsUsd, risk: account.risk }
        : top,
    null,
  );
  const totalSupplyUsd = sum(chains.map((chain) => chain.totalSupplyUsd));
  const totalDebtUsd = sum(chains.map(({ account }) => account.totalDebtUsd));
  return {
    lowestHealthFactor: byHealth[0] ?? null,
    totalSupplyUsd,
    totalDebtUsd,
    netUsd: totalSupplyUsd - totalDebtUsd,
    highestBorrowLimitUsed: highest,
    dangerChains: byHealth.filter((chain) => chain.risk === 'bahaya').map((chain) => chain.chainId),
  };
}

/** Isi segmen satu chain di bawah hero. Angka posisi (HF, supply, utang, pemakaian) diambil langsung dari `ChainView`. */
export type ChainSegment =
  | { kind: 'position'; ethShort: boolean }
  /** "Belum ada posisi · <largestWallet> di wallet bisa di-supply"; `null` = "Belum ada posisi" saja (Q21). */
  | { kind: 'empty'; largestWallet: { symbol: string; amount: bigint; decimals: number } | null; ethShort: boolean };

type GasCheck = {
  ethBalance: bigint;
  /** Perkiraan kasar biaya satu aksi Aave (`typicalActionFee`), wei. `null` = belum terbaca. */
  typicalActionFee: bigint | null;
};

export function chainSegment(view: ChainView, { ethBalance, typicalActionFee }: GasCheck): ChainSegment {
  // Badge "ETH kurang untuk bertransaksi" (Q10). ETH 0 sudah pasti kurang walau perkiraan biaya belum ada (sama dengan nextStep).
  const ethShort = ethBalance === 0n || (typicalActionFee !== null && ethBalance < typicalActionFee);
  if (view.supplies.length > 0 || view.borrows.length > 0) return { kind: 'position', ethShort };
  // Pasar supply cuma berisi aset yang bisa di-supply sekarang (bukan Dibekukan/Dijeda), jadi saldo terbesar diambil dari situ.
  const largest = view.supplyMarket
    .filter((row) => row.walletBalance !== null && row.walletBalance > 0n)
    .map((row) => ({ row, usd: (Number(row.walletBalance) / 10 ** row.decimals) * row.priceUsd }))
    .sort((a, b) => b.usd - a.usd)[0]?.row;
  return {
    kind: 'empty',
    largestWallet: largest ? { symbol: largest.symbol, amount: largest.walletBalance!, decimals: largest.decimals } : null,
    ethShort,
  };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
