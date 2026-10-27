# Dashboard membaca posisi semua chain, bukan chain terpilih saja

Berbeda dengan app.aave.com (dashboard hanya untuk market yang sedang dibuka), dashboard app ini membaca posisi user di semua chain yang didukung sekaligus (multicall per chain), lalu menampilkan ringkasan, HF terendah, dan banner Bahaya yang tetap terlihat walau chain lain sedang dipilih. Persona utama adalah user pro dengan posisi di beberapa chain; kalau hanya chain terpilih yang ditampilkan, utang yang hampir dilikuidasi di chain lain tidak terlihat. Konsekuensinya: layer data dibuat multi-chain sejak awal, dan ringkasan harus jujur saat sebagian chain gagal dibaca ("Belum lengkap").

## Considered Options

- **Chain terpilih saja (seperti Aave)**: lebih ringan dan familiar, ditolak karena menyembunyikan risiko lintas chain.
