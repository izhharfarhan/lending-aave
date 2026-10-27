import type { Address } from 'viem';

export type WhitelistAsset = {
  /** Alamat underlying reserve (dari address-book). */
  address: Address;
  /** Simbol yang ditampilkan; reserve WETH tampil sebagai "ETH". */
  symbol: string;
  /** `true` = dipakai sebagai ETH native lewat WrappedTokenGateway, jadi saldo wallet-nya saldo ETH. */
  native: boolean;
  /** Token yang menolak approve dari izin ≠ 0 ke nilai ≠ 0 (USDT Ethereum): reset ke 0 dulu. */
  requiresApprovalReset?: true;
};

/** Field `AggregatedReserveData` UiPoolDataProviderV3 yang dipakai modul ini (struct lengkapnya juga lolos). */
export type ReserveRead = {
  underlyingAsset: Address;
  symbol: string;
  decimals: bigint;
  baseLTVasCollateral: bigint;
  /** bps. */
  reserveLiquidationThreshold: bigint;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
  isActive: boolean;
  isFrozen: boolean;
  isPaused: boolean;
  liquidityIndex: bigint;
  variableBorrowIndex: bigint;
  /** APR supply, ray. */
  liquidityRate: bigint;
  /** APR pinjaman variabel, ray. */
  variableBorrowRate: bigint;
  lastUpdateTimestamp: number;
  priceInMarketReferenceCurrency: bigint;
};

export type UserReserveRead = {
  underlyingAsset: Address;
  scaledATokenBalance: bigint;
  usageAsCollateralEnabledOnUser: boolean;
  scaledVariableDebt: bigint;
};

/** Hasil `Pool.getUserAccountData`, semua nilai dalam mata uang referensi pasar kecuali `ltv` (bps) dan `healthFactor` (wad). */
export type AccountRead = {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
};

/** Semua yang dibaca adapter dari satu chain dalam satu multicall, di blok yang sama. */
export type ChainRead = {
  blockTimestamp: bigint;
  reserves: ReserveRead[];
  baseCurrency: { marketReferenceCurrencyUnit: bigint; marketReferenceCurrencyPriceInUsd: bigint };
  /** `null` = wallet belum terhubung. */
  user: {
    reserves: UserReserveRead[];
    eModeCategoryId: number;
    account: AccountRead;
    /** Saldo wallet per alamat whitelist; aset `native` berisi saldo ETH. */
    walletBalances: Record<Address, bigint>;
    /** `allowance(user, Pool)` per alamat whitelist ERC20 (aset `native` lewat gateway, nggak ada di sini). */
    allowances: Record<Address, bigint>;
    /**
     * Izin ke WrappedTokenGateway untuk aset `native`: `aWETH.allowance(user, gateway)` (withdraw ETH) dan
     * `variableDebtWETH.borrowAllowance(user, gateway)` (borrow ETH). `null` = whitelist chain ini tanpa aset `native`.
     */
    gatewayAllowances: { withdraw: bigint; borrow: bigint } | null;
  } | null;
};

export type RiskLevel = 'aman' | 'waspada' | 'bahaya';

export type AccountView = {
  /** `null` = tidak ada utang (ditulis "Tidak ada utang", bukan "∞"). */
  healthFactor: number | null;
  risk: RiskLevel | null;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  availableBorrowsUsd: number;
  /** Utang ÷ batas pinjam (jaminan × LTV). `null` = tidak ada utang (bar disembunyikan). Bisa > 1. */
  borrowLimitUsed: number | null;
};

/** Dijeda (paused) menang atas Dibekukan (frozen): Dijeda menolak semua aksi, Dibekukan masih boleh withdraw/repay. */
export type ReserveStatus = 'aktif' | 'dibekukan' | 'dijeda';

type PositionRowBase = {
  asset: Address;
  symbol: string;
  decimals: number;
  /** Saldo/utang termasuk bunga sampai `blockTimestamp`, satuan terkecil token. */
  amount: bigint;
  amountUsd: number;
  apy: number;
  /** Aset luar whitelist: read-only, dikelola di app.aave.com, tetap terhitung di HF dan total (Q13). */
  outside: boolean;
  status: ReserveStatus;
};
export type SupplyRow = PositionRowBase & {
  collateral: boolean;
  /** LTV reserve ≠ 0: boleh dinyalakan sebagai jaminan (kontrak menolak aset ber-LTV 0). */
  canBeCollateral: boolean;
  priceUsd: number;
  /** APR supply (ray), untuk kelonggaran "withdraw semua". */
  supplyRate: bigint;
  /** ETH: withdraw lewat gateway; toggle jaminannya tetap langsung ke Pool. */
  native: boolean;
  /** Withdraw ETH: izin aWETH ke gateway. `null` = ERC20 (withdraw langsung dari Pool, tanpa izin). */
  allowance: bigint | null;
};
export type DebtRow = PositionRowBase & {
  /** Saldo wallet & izin ke Pool untuk tab Repay. `null` = aset luar (tanpa aksi); izin juga `null` untuk aset `native`. */
  walletBalance: bigint | null;
  allowance: bigint | null;
  priceUsd: number;
  /** APR pinjaman variabel (ray), untuk bantalan bunga repay penuh. */
  borrowRate: bigint;
  native: boolean;
  requiresApprovalReset: boolean;
};

type MarketRowBase = { asset: Address; symbol: string; decimals: number; apy: number };
export type SupplyMarketRow = MarketRowBase & {
  /** `null` = wallet belum terhubung. */
  walletBalance: bigint | null;
  /** Izin ke Pool. `null` = belum terhubung, atau aset `native` (lewat gateway, tanpa approve). */
  allowance: bigint | null;
  canBeCollateral: boolean;
  /** Harga oracle Aave dalam USD, untuk padanan USD jumlah yang diisi. */
  priceUsd: number;
  /** Dari whitelist: ETH lewat gateway (tiket 06), selain itu ERC20 lewat approve ke Pool. */
  native: boolean;
  requiresApprovalReset: boolean;
};
export type BorrowMarketRow = MarketRowBase & {
  /** Sisa batas pinjam dalam token ini. `null` = wallet belum terhubung. */
  borrowable: bigint | null;
  priceUsd: number;
  /** ETH dipinjam lewat gateway. */
  native: boolean;
  /** Borrow ETH: credit delegation ke gateway. `null` = belum terhubung, atau ERC20 (borrow langsung dari Pool). */
  allowance: bigint | null;
};

export type ChainView = {
  /** `null` = wallet belum terhubung. */
  account: AccountView | null;
  supplies: SupplyRow[];
  borrows: DebtRow[];
  /** Semua aset whitelist yang bisa di-supply; filter saldo 0 lewat `visibleSupplyMarket`. */
  supplyMarket: SupplyMarketRow[];
  borrowMarket: BorrowMarketRow[];
};

const WAD = 10n ** 18n;
const RAY = 10n ** 27n;
const BPS = 10_000;
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

// Ambang tingkat risiko (#9, Q2): Aman ≥ 2,0 · Waspada 1,5–2,0 · Bahaya < 1,5.
export function riskLevel(healthFactor: number): RiskLevel {
  if (healthFactor >= 2) return 'aman';
  if (healthFactor >= 1.5) return 'waspada';
  return 'bahaya';
}

export function buildChainView(read: ChainRead, whitelist: WhitelistAsset[]): ChainView {
  const toUsd = baseToUsd(read.baseCurrency);
  const reserveOf = new Map(read.reserves.map((r) => [key(r.underlyingAsset), r]));
  const listed = new Map(whitelist.map((asset, order) => [key(asset.address), { asset, order }]));

  const rows = (read.user?.reserves ?? []).flatMap((position) => {
    const reserve = reserveOf.get(key(position.underlyingAsset));
    return reserve ? [{ position, reserve }] : [];
  });
  const row = (reserve: ReserveRead, amount: bigint, rate: bigint): PositionRowBase => {
    const entry = listed.get(key(reserve.underlyingAsset));
    return {
      asset: reserve.underlyingAsset,
      symbol: entry?.asset.symbol ?? reserve.symbol,
      decimals: Number(reserve.decimals),
      amount,
      amountUsd: toUsd((amount * reserve.priceInMarketReferenceCurrency) / 10n ** reserve.decimals),
      apy: aprToApy(rate),
      outside: !entry,
      status: reserveStatus(reserve),
    };
  };
  // Aset whitelist dulu sesuai urutan whitelist, lalu aset luar dari nilai terbesar.
  const order = (a: PositionRowBase, b: PositionRowBase) =>
    (listed.get(key(a.asset))?.order ?? Infinity) - (listed.get(key(b.asset))?.order ?? Infinity) || b.amountUsd - a.amountUsd;

  const supplies = rows
    .filter(({ position }) => position.scaledATokenBalance > 0n)
    .map(({ position, reserve }) => ({
      ...row(reserve, suppliedBalance(position.scaledATokenBalance, reserve, read.blockTimestamp), reserve.liquidityRate),
      collateral: position.usageAsCollateralEnabledOnUser,
      canBeCollateral: reserve.baseLTVasCollateral > 0n,
      priceUsd: toUsd(reserve.priceInMarketReferenceCurrency),
      supplyRate: reserve.liquidityRate,
      ...nativeOf(listed.get(key(reserve.underlyingAsset))?.asset, read.user?.gatewayAllowances?.withdraw),
    }))
    .sort(order);
  const borrows = rows
    .filter(({ position }) => position.scaledVariableDebt > 0n)
    .map(({ position, reserve }) => {
      const asset = listed.get(key(reserve.underlyingAsset))?.asset;
      const erc20 = asset && !asset.native ? asset : undefined;
      return {
        ...row(reserve, debtBalance(position.scaledVariableDebt, reserve, read.blockTimestamp), reserve.variableBorrowRate),
        // Aset `native`: saldo ETH (repay lewat gateway, tanpa izin).
        walletBalance: asset ? (read.user?.walletBalances[asset.address] ?? 0n) : null,
        allowance: erc20 ? (read.user?.allowances[erc20.address] ?? 0n) : null,
        priceUsd: toUsd(reserve.priceInMarketReferenceCurrency),
        borrowRate: reserve.variableBorrowRate,
        native: asset?.native ?? false,
        requiresApprovalReset: asset?.requiresApprovalReset ?? false,
      };
    })
    .sort(order);

  // Pasar cuma berisi aset whitelist yang reserve-nya aktif, tidak Dibekukan, dan tidak Dijeda (#4). Posisi lama di
  // reserve seperti itu tetap ada di `supplies`/`borrows` dengan labelnya.
  const offered = whitelist.flatMap((asset) => {
    const reserve = reserveOf.get(key(asset.address));
    return reserve && reserve.isActive && reserveStatus(reserve) === 'aktif' ? [{ asset, reserve }] : [];
  });
  const market = (asset: WhitelistAsset, reserve: ReserveRead, rate: bigint): MarketRowBase => ({
    asset: reserve.underlyingAsset,
    symbol: asset.symbol,
    decimals: Number(reserve.decimals),
    apy: aprToApy(rate),
  });
  const user = read.user;
  const supplyMarket = offered.map(({ asset, reserve }) => ({
    ...market(asset, reserve, reserve.liquidityRate),
    walletBalance: user ? (user.walletBalances[asset.address] ?? 0n) : null,
    allowance: user && !asset.native ? (user.allowances[asset.address] ?? 0n) : null,
    canBeCollateral: reserve.usageAsCollateralEnabled && reserve.baseLTVasCollateral > 0n,
    priceUsd: toUsd(reserve.priceInMarketReferenceCurrency),
    native: asset.native,
    requiresApprovalReset: asset.requiresApprovalReset ?? false,
  }));
  // E-Mode (borrowableBitmap) menyusul di tiket 14; di luar E-Mode ikut `borrowingEnabled`.
  const borrowMarket = offered
    .filter(({ reserve }) => reserve.borrowingEnabled)
    .map(({ asset, reserve }) => ({
      ...market(asset, reserve, reserve.variableBorrowRate),
      borrowable: user
        ? (user.account.availableBorrowsBase * 10n ** reserve.decimals) / reserve.priceInMarketReferenceCurrency
        : null,
      priceUsd: toUsd(reserve.priceInMarketReferenceCurrency),
      ...nativeOf(asset, user?.gatewayAllowances?.borrow),
    }));

  return { account: user ? accountView(user.account, toUsd) : null, supplies, borrows, supplyMarket, borrowMarket };
}

/** "Pasar supply" menyembunyikan aset bersaldo 0 di wallet kecuali "Tampilkan semua" (#4); belum connect = semua. */
export function visibleSupplyMarket(rows: SupplyMarketRow[], showAll: boolean): SupplyMarketRow[] {
  return showAll ? rows : rows.filter((row) => row.walletBalance !== 0n);
}

const key = (address: Address) => address.toLowerCase();
// Aset `native` lewat gateway membawa izinnya ke gateway (aWETH / delegation); ERC20 nggak.
const nativeOf = (asset: WhitelistAsset | undefined, gatewayAllowance: bigint | undefined) => {
  const native = asset?.native ?? false;
  return { native, allowance: native ? (gatewayAllowance ?? null) : null };
};

function reserveStatus(reserve: ReserveRead): ReserveStatus {
  if (reserve.isPaused) return 'dijeda';
  if (reserve.isFrozen) return 'dibekukan';
  return 'aktif';
}

// Saldo aToken & utang persis seperti kontrak v3.7 (ReserveLogic.getNormalizedIncome/Debt, MathUtils, TokenMath):
// bunga supply linear, bunga pinjaman majemuk (pendekatan binomial 3 suku), aToken dibulatkan ke bawah, utang ke atas.
export function suppliedBalance(scaled: bigint, reserve: ReserveRead, now: bigint): bigint {
  const elapsed = now - BigInt(reserve.lastUpdateTimestamp);
  const income = elapsed <= 0n ? reserve.liquidityIndex : rayMul(RAY + (reserve.liquidityRate * elapsed) / SECONDS_PER_YEAR, reserve.liquidityIndex);
  return (scaled * income) / RAY;
}

export function debtBalance(scaled: bigint, reserve: ReserveRead, now: bigint): bigint {
  const elapsed = now - BigInt(reserve.lastUpdateTimestamp);
  let index = reserve.variableBorrowIndex;
  if (elapsed > 0n) {
    const x = (reserve.variableBorrowRate * elapsed) / SECONDS_PER_YEAR;
    index = rayMul(RAY + x + rayMul(x, x / 2n + rayMul(x, x / 6n)), index);
  }
  const product = scaled * index;
  return product / RAY + (product % RAY === 0n ? 0n : 1n);
}

const rayMul = (a: bigint, b: bigint) => (a * b + RAY / 2n) / RAY;

// Rate on-chain = APR (ray), bunga majemuk per detik → APY (cara app.aave.com).
function aprToApy(rate: bigint): number {
  const apr = Number(rate) / Number(RAY);
  const n = Number(SECONDS_PER_YEAR);
  return (1 + apr / n) ** n - 1;
}

// Angka "saat ini" langsung dari getUserAccountData (sumber kebenaran, termasuk aset luar dan E-Mode).
export function accountView(account: AccountRead, toUsd: (base: bigint) => number): AccountView {
  const hasDebt = account.totalDebtBase > 0n;
  const healthFactor = hasDebt ? Number(account.healthFactor) / Number(WAD) : null;
  const totalDebtUsd = toUsd(account.totalDebtBase);
  const borrowLimitUsd = (toUsd(account.totalCollateralBase) * Number(account.ltv)) / BPS;
  return {
    healthFactor,
    risk: healthFactor === null ? null : riskLevel(healthFactor),
    totalCollateralUsd: toUsd(account.totalCollateralBase),
    totalDebtUsd,
    availableBorrowsUsd: toUsd(account.availableBorrowsBase),
    borrowLimitUsed: hasDebt ? totalDebtUsd / borrowLimitUsd : null,
  };
}

// Nilai mata uang referensi pasar → USD. Di Aave V3 referensinya USD (unit 1e8, harga 1e8), tapi tetap dikonversi
// lewat BaseCurrencyInfo biar nggak diam-diam salah kalau ada market berreferensi lain.
export function baseToUsd({ marketReferenceCurrencyUnit, marketReferenceCurrencyPriceInUsd }: ChainRead['baseCurrency']) {
  const USD_DECIMALS = 1e8;
  return (base: bigint) =>
    (Number(base) / Number(marketReferenceCurrencyUnit)) * (Number(marketReferenceCurrencyPriceInUsd) / USD_DECIMALS);
}
