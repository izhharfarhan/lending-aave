// Pemakaian: pnpm start-blocks:mainnet (tiket 25, DECISIONS Q31). Mencetak blok terbaru tiap chain dalam bentuk baris
// `START_BLOCK_<chainId>=` untuk disalin SEKALI ke .env.mainnet sebelum `dev:mainnet` pertama. Jangan diganti sesudahnya:
// start block baru = build Ponder baru = index ulang dari blok itu, riwayat sebelumnya hilang. URL RPC nggak dicetak.
import { createPublicClient, http } from 'viem';

for (const chainId of [1, 8453, 42161]) {
  const url = process.env[`PONDER_RPC_URL_${chainId}`];
  if (!url) {
    console.error(`PONDER_RPC_URL_${chainId} kosong di .env.mainnet`);
    process.exitCode = 1;
    continue;
  }
  try {
    const block = await createPublicClient({ transport: http(url) }).getBlockNumber();
    console.log(`START_BLOCK_${chainId}=${block}`);
  } catch (err) {
    // Pesan viem bisa memuat URL; cukup nama error-nya.
    console.error(`chain ${chainId}: gagal dibaca (${err.name})`);
    process.exitCode = 1;
  }
}
