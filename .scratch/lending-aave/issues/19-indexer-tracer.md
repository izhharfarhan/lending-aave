# 19: Indexer tracer (repo lending-indexer)

**Repo:** lending-indexer

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Supply di fork Ethereum tercatat oleh indexer dan bisa diambil lewat GraphQL dengan pemilik yang benar (dari `onBehalfOf`, bukan `txFrom`).

**Blocked by:** 01 (Fork Ethereum + wallet + pengaman + kerangka tampilan)

**Status:** ready-for-agent

- [ ] Repo `lending-indexer`: Ponder + Postgres Docker + Hono GraphQL (pola swap-indexer)
- [ ] Event `Supply` Pool Ethereum; pemilik = `onBehalfOf`; jumlah disimpan sebagai bigint mentah
- [ ] Butuh RPC archive
- [ ] **Sebelum implementasi**: putuskan strategi `eth_getLogs` (lihat Comments 2026-10-27) dan **ajukan pilihannya ke user dulu**
- [ ] Test Vitest + fixture Anvil terpisah tanpa revert (pola swap-indexer)

## Comments

- 2026-10-27 (dari tiket 02): Alchemy free plan membatasi `eth_getLogs` **10 blok per request**. Error-nya menyesatkan ("ranges over 10000 blocks are not supported on free plan"), padahal range 3.000 blok pun ditolak. Lewat Anvil fork, log sebelum blok pin diteruskan ke Alchemy, jadi batas yang sama berlaku.
  - Pilihan yang perlu diputuskan sebelum implementasi (ajukan ke user, jangan langsung pilih):
    1. `START_BLOCK` dekat blok pin. Backfill pendek, sisanya event dari fork lokal.
    2. RPC lain khusus `getLogs` yang range-nya besar, terpisah dari RPC archive untuk `eth_call`.
    3. Batas range di config Ponder (mis. `ethGetLogsBlockRange: 10`). Lambat untuk range panjang.
  - Ini juga menyentuh tiket 20 (3 chain) dan 21 (likuidasi, butuh `getUserAccountData` di blok −1 lewat archive).
