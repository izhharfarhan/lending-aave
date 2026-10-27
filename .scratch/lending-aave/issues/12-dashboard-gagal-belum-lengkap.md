# 12: Dashboard: gagal dimuat, belum lengkap, refresh, ajakan connect

**Repo:** lending-web

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Ringkasan semua chain tetap jujur saat satu chain gagal dibaca: segmen "Gagal dimuat · Coba lagi", label "Belum lengkap (2/3 chain)", HF terendah "≤ x", dan data diperbarui otomatis. User yang belum connect melihat ajakan yang jelas.

**Blocked by:** 11 (Dashboard: hero + segmen chain + banner Bahaya)

**Status:** ready-for-agent

- [ ] Segmen chain gagal → "Gagal dimuat" + "Coba lagi"; detail chain itu menjelaskan bahwa ringkasan belum menghitungnya
- [ ] Ringkasan berlabel "Belum lengkap (n/3 chain)"; HF terendah "≤ x · <chain> belum terbaca, bisa lebih rendah" (Q4); bar batas pinjam "<chain> belum terbaca, bisa saja lebih tinggi" (Q24)
- [ ] Skeleton saat pertama dimuat
- [ ] Auto-refresh ±30 detik + saat tab difokuskan
- [ ] Belum connect: ajakan "Hubungkan wallet untuk melihat posisi Anda di Ethereum, Base, dan Arbitrum sekaligus" di hero dan segmen (Q6)
- [ ] Test Jest modul domain untuk ringkasan belum lengkap (≤, bisa saja lebih tinggi)
