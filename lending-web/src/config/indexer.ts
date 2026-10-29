// lending-indexer (Ponder + GraphQL, tiket 19–21). Harus ditulis lengkap `process.env.NEXT_PUBLIC_...` biar di-inline
// Next. Kosong = indexer dianggap offline: riwayat cuma dari browser ini, badge "Riwayat mungkin belum lengkap".
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || null;
