# 07: Withdraw ETH + borrow ETH lewat WrappedTokenGateway

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa menarik dan meminjam ETH langsung. Withdraw meminta izin aWETH ke gateway (berbantalan supaya withdraw semua nggak gagal karena bunga), dan borrow meminta izin berutang atas nama user (credit delegation), masing-masing dijelaskan sebelum popup wallet.

**Blocked by:** 05 (Withdraw ERC20 + toggle jaminan), 06 (Supply & repay ETH lewat WrappedTokenGateway)

**Status:** resolved

- [x] Withdraw ETH: langkah "Approve aWETH ke WrappedTokenGateway" dijelaskan; izin berbantalan; withdraw semua memakai `type(uint256).max` dan nggak gagal karena saldo aWETH bertambah oleh bunga (V2, #8)
- [x] Borrow ETH: langkah "Izinkan gateway berutang atas nama Anda" (`approveDelegation`) dijelaskan
- [x] `withdrawETHWithPermit` tidak dipakai
- [x] Test `nextStep` untuk kedua izin, dan withdraw semua ETH + borrow ETH di fork (termasuk setelah maju waktu supaya bunga bertambah)

## Comments

- 2026-10-27 (implementasi):
  - Withdraw ETH: `aWETH.approve(gateway, x)` lalu `withdrawETH(pool, amount, user)`. Withdraw semua: `amount = type(uint256).max`, izin aWETH = saldo + bunga supply 1 hari (`WithdrawPlan.spend`), izin minimum untuk lanjut = saldo + bunga 1 jam (`WithdrawPlan.required`, pola `RepayPlan`). Langkah approve-nya tetap `approve` di `nextStep`; jalurnya (Pool vs gateway) diputuskan `PanelTx.gateway`.
  - Borrow ETH: langkah wallet baru `delegate` = `variableDebtWETH.approveDelegation(gateway, x)` lalu `borrowETH(pool, amount, 0)`. Exact/unlimited berlaku juga untuk kedua izin ini.
  - Izin dibaca di multicall yang sama dengan posisi: `ChainRead.user.gatewayAllowances` (`aWETH.allowance(user, gateway)`, `borrowAllowance(user, gateway)`); alamat aWETH/variableDebtWETH dari address-book (`AaveContracts.aWeth`, `variableDebtWeth`). Fixture posisi dibuat ulang dari blok pin (cuma menambah field ini; dua akun nyata ternyata sudah punya izin aWETH ke gateway).
  - Test fork: withdraw sebagian (izin exact habis terpakai), withdraw semua sesudah +30 hari dengan +1 jam di antara approve dan withdraw (aWETH 0, gateway 0 ETH), borrow ETH (delegation exact jadi 0 sesudahnya), dan bukti V2: izin persis saldo + maju 1 hari → `withdrawETH(max)` revert.
  - UI: ternary ETH vs ERC20 dirapikan jadi satu `route` (`pool` | `gateway`); teks langkah wallet per jalur di `STEPS.*.detail`, dan semua teks izin (judul, penjelasan, tombol, exact/unlimited) per jenis di `GRANT` (`pool`, `aWeth`, `delegation`). Langkah izin gateway menampilkan kontrak aWETH / variableDebtWETH + gateway sebagai alamat resmi. Link revoke.cash disembunyikan untuk credit delegation.
- Keputusan user sesudah review (credit delegation):
  - **Selalu exact, tanpa pilihan Unlimited.** Delegation unlimited = pihak lain bisa berutang atas nama user; risikonya nggak sebanding dengan hemat satu popup wallet per borrow ETH. `nextStep` mengabaikan `approvalMode` untuk `delegate`, dan pengaturan izin di panel nggak menampilkan pilihan exact/unlimited untuk delegation.
  - **Link revoke.cash tetap disembunyikan** (revoke.cash belum tentu menampilkan credit delegation). Gantinya satu kalimat: izin ini habis terpakai otomatis setelah pinjam.
