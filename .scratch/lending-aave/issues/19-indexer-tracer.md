# 19: Indexer tracer (repo lending-indexer)

**Repo:** lending-indexer

**Spec:** `.scratch/lending-aave/spec.md` · keputusan di `DECISIONS.md`

**What to build:** Supply di fork Ethereum tercatat oleh indexer dan bisa diambil lewat GraphQL dengan pemilik yang benar (dari `onBehalfOf`, bukan `txFrom`).

**Blocked by:** 01 (Fork Ethereum + wallet + pengaman + kerangka tampilan)

**Status:** ready-for-agent

- [ ] Repo `lending-indexer`: Ponder + Postgres Docker + Hono GraphQL (pola swap-indexer)
- [ ] Event `Supply` Pool Ethereum; pemilik = `onBehalfOf`; jumlah disimpan sebagai bigint mentah
- [ ] Butuh RPC archive
- [ ] Test Vitest + fixture Anvil terpisah tanpa revert (pola swap-indexer)
