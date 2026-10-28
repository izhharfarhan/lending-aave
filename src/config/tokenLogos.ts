import { AaveV3Arbitrum, AaveV3Base, AaveV3Ethereum } from '@bgd-labs/aave-address-book';
import { getAddress, type Address } from 'viem';

/**
 * Logo asli token, file lokal di `public/tokens/` (sumber + lisensi: README di folder itu). Nggak pernah diambil dari
 * URL luar saat runtime: app tetap jalan offline di fork dan nggak membocorkan request ke pihak ketiga.
 * `plate` = logo yang bukan lingkaran (berlian ETH) ditaruh di atas lingkaran terang supaya kelihatan di tema gelap.
 */
export type TokenLogo = { src: string; plate?: boolean };

const ETH: TokenLogo = { src: '/tokens/eth.svg', plate: true };
const USDC: TokenLogo = { src: '/tokens/usdc.png' };
const USDT: TokenLogo = { src: '/tokens/usdt.svg' };
const USDT0: TokenLogo = { src: '/tokens/usdt0.svg' };
// Aset luar (Q13) yang punya logo resmi dari penerbitnya; sisanya inisial.
const logo = (file: string): TokenLogo => ({ src: `/tokens/${file}.svg` });
const AAVE = logo('aave');
const ARB = logo('arb');
const BAL = logo('bal');
const CBETH = logo('cbeth');
const EZETH = logo('ezeth');
const GHO = logo('gho');
const LDO = logo('ldo');
const LINK = logo('link');
const SNX = logo('snx');
const SUSDE = logo('susde');
const TBTC = logo('tbtc');
const TETH = logo('teth');
const UNI = logo('uni');
const USDE = logo('usde');
const USDTB = logo('usdtb');
const WBTC = logo('wbtc');
const WEETH = logo('weeth');
const WSTETH = logo('wsteth');

type Book = { ASSETS: Record<string, { UNDERLYING: Address }> };
const byKey = (book: Book, logos: Record<string, TokenLogo>): Record<Address, TokenLogo> =>
  Object.fromEntries(Object.entries(logos).map(([key, logo]) => [getAddress(book.ASSETS[key].UNDERLYING), logo]));

// Per chain berdasarkan ALAMAT (kunci address-book), bukan simbol, sama seperti whitelist: kunci address-book "USDC"
// di Arbitrum = USDC.e (bridged), USDC native = "USDCn"; USDbC di Base sengaja nggak dipetakan. Token tanpa logo di
// sini tampil sebagai lingkaran inisial.
export const TOKEN_LOGOS: Record<number, Record<Address, TokenLogo>> = {
  1: byKey(AaveV3Ethereum, {
    WETH: ETH,
    USDC,
    USDT,
    AAVE,
    BAL,
    cbETH: CBETH,
    ezETH: EZETH,
    GHO,
    LDO,
    LINK,
    SNX,
    sUSDe: SUSDE,
    tBTC: TBTC,
    tETH: TETH,
    UNI,
    USDe: USDE,
    USDtb: USDTB,
    WBTC,
    weETH: WEETH,
    wstETH: WSTETH,
  }),
  8453: byKey(AaveV3Base, { WETH: ETH, USDC, AAVE, cbETH: CBETH, ezETH: EZETH, GHO, tBTC: TBTC, weETH: WEETH, wstETH: WSTETH }),
  42161: byKey(AaveV3Arbitrum, {
    WETH: ETH,
    USDCn: USDC,
    USDT: USDT0,
    AAVE,
    ARB,
    ezETH: EZETH,
    GHO,
    LINK,
    tBTC: TBTC,
    WBTC,
    weETH: WEETH,
    wstETH: WSTETH,
  }),
};

/** `null` = belum ada logo asli: tampilkan lingkaran inisial. */
export function tokenLogo(chainId: number, asset: Address): TokenLogo | null {
  return TOKEN_LOGOS[chainId]?.[getAddress(asset)] ?? null;
}
