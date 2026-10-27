# 06: Supply & repay ETH lewat WrappedTokenGateway

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa supply dan repay memakai ETH langsung, tanpa langkah approve, dan kelebihan ETH saat repay dikembalikan otomatis.

**Blocked by:** 04 (Borrow & repay ERC20 + simulasi risiko + test paritas dasar)

**Status:** resolved

- [x] Supply ETH lewat `depositETH` (onBehalfOf = user), tanpa approve
- [x] Repay ETH lewat `repayETH` dengan ETH berbantalan; kelebihan di-refund gateway; repay penuh tanpa debu
- [x] Daftar langkah wallet menampilkan WrappedTokenGateway sebagai alamat resmi tujuan
- [x] ETH dan WETH diperlakukan sebagai aset yang sama di tampilan posisi
- [x] Test `nextStep` (tanpa langkah approve) dan supply/repay ETH di fork

## Comments

- 2026-10-27 (implementasi):
  - `depositETH(pool, user, 0)` dengan `value` = jumlah; `repayETH(pool, amount, user)`. Repay sebagian: `amount = value =` jumlah yang diisi. Repay penuh: `amount = type(uint256).max`, `value` = utang + bantalan bunga 1 hari; gateway membayar utang saat eksekusi dan mengembalikan sisanya (test fork: yang terbayar ≥ utang yang dilihat dan < yang dikirim, saldo ETH gateway tetap 0). Jumlah di atas utang juga diperlakukan sebagai lunas penuh (edge case di test fork).
  - Jalur gateway diputuskan di satu tempat: flag `gateway` di `PANEL_TABS` (supply & repay). Toggle jaminan ETH tetap langsung ke Pool; withdraw & borrow ETH di tiket 07.
  - Langkah wallet ETH menampilkan "Aave WrappedTokenGateway" (address-book `WETH_GATEWAY`) sebagai alamat resmi tujuan, tanpa langkah approve.
  - Baris utang ETH membawa saldo ETH wallet (repay dari ETH), izinnya `null`.
  - Cek saldo ETH belum menyisakan biaya gas: MAX dengan cadangan gas di tiket 08, "ETH kurang untuk biaya jaringan" di tiket 09.
  - Test infra: setup fork (supply/borrow WETH langsung ke Pool) sekarang lewat `sendWithMargin` (estimasi + margin, status receipt dicek); sebelumnya kadang revert diam-diam karena kehabisan gas.
