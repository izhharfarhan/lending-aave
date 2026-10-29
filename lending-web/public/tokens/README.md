# Logo token

Logo asli token yang dipakai `TokenIcon` (tiket 26). Pemetaan alamat → file per chain ada di
`src/config/tokenLogos.ts`; token yang nggak ada di sana tampil sebagai lingkaran inisial. File dipakai apa adanya
(tanpa diedit, sesuai pedoman merek penerbit); ETH diberi alas terang oleh komponen, bukan di file.

Semua file diambil 2026-10-29 dari sumber resmi penerbit (situs, brand kit, atau org GitHub penerbit), tanpa
agregator (CoinGecko, Trust Wallet, dll.). **Tidak ada yang berlisensi terbuka**: ini pemakaian merek dagang untuk
menamai token, tunduk pada pedoman/trademark policy masing-masing penerbit. Sumber GitHub dipatok ke commit.

| File | Token | Sumber | Lisensi / ketentuan (dikutip) |
|---|---|---|---|
| eth.svg | ETH/WETH | ethereum.org `public/images/assets/svgs/eth-diamond-purple.svg` (github.com/ethereum/ethereum-org-website), halaman ethereum.org/assets | Repo: MIT License, "Copyright (c) 2019-2026 ethereum.org contributors" |
| usdc.png | USDC (native, Ethereum/Base/Arbitrum) | github.com/circlefin/w3s-react-native-sample-app-wallets `assets/image/ic_usdc@3x.png` (repo resmi Circle, PNG 109×108) | Repo: Apache-2.0. SVG resmi ada di Brand Kit circle.com/pressroom, tapi circle.com nggak terjangkau dari jaringan agent |
| usdt.svg | USDT (Ethereum) | tether.to/en/media, "Tether Logo Formatted for Use in Circular Displays" (`tether.to/images/logoCircle.svg`) | Nggak ada ketentuan di halaman; footer "All rights reserved" |
| usdt0.svg | USD₮0 (USDT Arbitrum) | Media kit USDT0, docs.usdt0.to/resources/mediakit, "USDT0 Icon" (`/downloads/usdt0/Symbol_USDT0_Secondary.svg`) | Nggak ada ketentuan di halaman; pedoman merek di PDF media kit |
| gho.svg | GHO | github.com/aave-dao/aave-brand-kit `GHO/gho-token-logo.svg` @6063f9ee53e7 | Tanpa LICENSE; README: "Please follow the visual identity guidelines…" |
| aave.svg | AAVE | github.com/aave/interface `public/icons/tokens/aave.svg` @ddc287a5a78d (brand kit Aave nggak punya ikon token bulat) | LICENSE.md: "All Rights Reserved © Aave Labs" |
| wsteth.svg | wstETH | github.com/lidofinance/logos `wstETH/wstETH.svg` @8e6f1a1e0f03 | Tanpa lisensi |
| ldo.svg | LDO | github.com/lidofinance/logos `LDO/LDO.svg` @8e6f1a1e0f03 | Tanpa lisensi |
| wbtc.svg | WBTC | wbtc.network/brandKit, "Logomark white" (`/brandkit/logo2-white.svg`) | "Please do not edit, change, distort, recolor, or reconfigure the WBTC logo." Footer: "All rights reserved" |
| link.svg | LINK | chain.link/brand-assets, Chainlink Symbol Blue | "…read and follow our Trademark Guidelines…" |
| tbtc.svg | tBTC | threshold.network/brand-guide, "tBTC Token, Download in SVG" | Footer: "All Rights Reserved. Threshold" |
| cbeth.svg | cbETH | github.com/coinbase/wrapped-tokens-os `cbETH Logo Kit/Asset icons/SVG/` @5697a90f4c47 | Tanpa LICENSE (package.json "MIT", kemungkinan cuma kode) |
| weeth.svg | weETH | github.com/etherfi-protocol/design_assets `logos/weETH.svg` @e2f563b6c827 | Tanpa lisensi |
| arb.svg | ARB | Arbitrum Foundation Brand Kit (arbitrumfoundation.notion.site), Logomark RGB | "…these guidelines are designed to ensure its consistent and appropriate use." Logomark Arbitrum, bukan ikon koin terpisah |
| usde.svg | USDe | ethena.fi `/shared/usde.svg` | Tanpa ketentuan (kit lengkap di Figma, docs.ethena.fi/resources/media-assets) |
| susde.svg | sUSDe | ethena.fi `/shared/sUSDe.svg` | Tanpa ketentuan |
| usdtb.svg | USDtb | ethena.fi `/navbar/USDtb.svg` (diterbitkan Ethena) | Tanpa ketentuan |
| ezeth.svg | ezETH | Renzo brand kit (renzobrandkit.notion.site, dari docs.renzoprotocol.com), "ezeth token icon dark background" | "…guidelines are designed to ensure its consistent and appropriate use." |
| snx.svg | SNX | synthetix.io/brand, `/brand/brand-kit/token/snx-token.svg` | Footer: "All rights reserved" |
| uni.svg | UNI | github.com/Uniswap/brand-assets `Uniswap_icon_pink.svg` @1d829912a8b1 | "Before usage, please review our Brand Guide and Trademark Policy (https://uniswap.org/trademark)." |
| bal.svg | BAL | github.com/balancer/brand-assets `logo/circle-container/logo-balancer-white-512x512.svg` @455ad634ab7e | Tanpa lisensi |
| teth.svg | tETH | treehouse.finance `/landing-assets-v2/teth-icon.svg` (brand kit nggak ditemukan) | Tanpa ketentuan |

## Sengaja tanpa logo (inisial)

- **ENS**: ens.domains/brand mensyaratkan perjanjian lisensi merek ("you must obtain a license first").
- **RPL**: yang tersedia cuma logo organisasi Rocket Pool, belum pasti sama dengan logo token.
- **CRV, crvUSD**: file resmi (github.com/curvefi/curve-assets `branding/`) 300–430 KB, terlalu berat untuk ikon 22px.
- **USDbC (Base), USDC.e (Arbitrum)**: USDC bridged; nggak boleh memakai logo USDC native, dan penerbit nggak punya logo terpisah.
- **Nggak ada sumber resmi yang terjangkau** (cuma salinan agregator, PNG saja, atau situs penerbit menolak): cbBTC, rETH, DAI, USDS, sDAI, MKR, ETHx, EURC, LBTC, eBTC, MAI, XAUt, KNC, LUSD, 1INCH, FRAX, FXS, STG, PYUSD, osETH, rsETH/wrsETH, RLUSD, FBTC, syrupUSDC, syrupUSDT, mUSD, USDG, EURS, token PT Pendle.

Menambah logo: taruh file dari sumber resmi di sini, tambah barisnya di tabel, lalu petakan alamatnya per chain di
`src/config/tokenLogos.ts` (test `tokenLogos.spec.ts` memastikan tiap file yang dipetakan ada).
