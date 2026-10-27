# 24: E2E Playwright

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Alur utama supply → borrow → repay berjalan di browser melawan fork, termasuk skenario reject, sebagai pengaman regresi.

**Blocked by:** 07 (Withdraw ETH + borrow ETH lewat WrappedTokenGateway), 17 (Dev Tools dasar + maju waktu)

**Status:** ready-for-agent

- [ ] Playwright + connector fork (pola e2e swap-web)
- [ ] Alur supply → borrow → repay, plus skenario reject di wallet
- [ ] 9 state Q22 tidak diulang di browser (sudah diuji di modul domain dan `nextStep`)
