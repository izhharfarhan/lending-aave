# 05: Withdraw ERC20 + toggle jaminan

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** User bisa menarik supply dan menyalakan/mematikan aset sebagai jaminan, dengan HF sesudah dan kunci yang mencegah posisi melewati batas LTV.

**Blocked by:** 04 (Borrow & repay ERC20 + simulasi risiko + test paritas dasar)

**Status:** ready-for-agent

- [ ] Simulasi withdraw dan toggle jaminan di modul domain, dengan tier #9
- [ ] Withdraw dan mematikan jaminan dikunci di batas LTV, **lebih ketat dari kontrak** (kontrak hanya HF ≥ 1; V8). Ini disengaja dan dicatat di komentar/test
- [ ] Toggle jaminan di tabel Supply Anda membuka panel yang menjelaskan akibatnya + HF sebelum → sesudah; dikunci "Jaminan ini masih dibutuhkan" kalau melewati batas
- [ ] Pesan aturan ltv0 diterjemahkan (mis. punya jaminan USDC.e ber-LTV 0 → harus ditarik/dimatikan dulu)
- [ ] Posisi Dibekukan tetap bisa withdraw/repay; Dijeda semua aksi nonaktif dengan penjelasan
- [ ] Test Jest modul domain + `nextStep`, dan withdraw/toggle di fork
