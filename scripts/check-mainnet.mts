// Pemakaian: pnpm check:mainnet (tiket 25). Read-only, nggak mengirim tx:
// - `POOL_REVISION` di 3 chain harus 11 (versi yang aturan E-Mode/event-nya diverifikasi, DECISIONS "Versi ter-deploy").
// - Perkiraan biaya smoke test per chain dari gas saat ini: urutan langkah wallet di README, gas = batas atas `STEP_GAS`
//   (kalibrasi fork), Base + L1 fee per tx dari GasPriceOracle.
// URL RPC (ber-key) nggak pernah dicetak.
import { createPublicClient, encodeFunctionData, formatEther, formatGwei, http, parseAbi, parseEther, type Address } from 'viem';
import { estimateL1Fee } from 'viem/op-stack';

import { SUPPORTED_CHAINS } from '@/config/chains';
import { isOpStack, STEP_GAS } from '@/core/networkFee';
import type { WalletStepName } from '@/core/nextStep';

const EXPECTED_REVISION = 11n;
/** Smoke test README: supply ETH, borrow USDC, approve + lunasi USDC, approve aWETH + withdraw semua ETH. */
const SMOKE_STEPS: WalletStepName[] = ['supply', 'borrow', 'approve', 'repay', 'approve', 'withdraw'];

const poolAbi = parseAbi([
  'function POOL_REVISION() view returns (uint256)',
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
]);
const oracleAbi = parseAbi(['function getAssetPrice(address asset) view returns (uint256)']);

let ok = true;
for (const chain of SUPPORTED_CHAINS) {
  const url = process.env[`NEXT_PUBLIC_RPC_URL_${chain.chainId}`];
  if (!url) {
    console.log(`${chain.name}: NEXT_PUBLIC_RPC_URL_${chain.chainId} kosong di .env.mainnet`);
    ok = false;
    continue;
  }
  const client = createPublicClient({ chain: chain.viemChain, transport: http(url) });
  const weth = chain.whitelist.find((asset) => asset.native)!.address;
  try {
    const [revision, block, gasPrice, ethPrice] = await Promise.all([
      client.readContract({ address: chain.aave.pool, abi: poolAbi, functionName: 'POOL_REVISION' }),
      client.getBlock(),
      client.getGasPrice(),
      client.readContract({ address: chain.aave.oracle, abi: oracleAbi, functionName: 'getAssetPrice', args: [weth] }),
    ]);
    const gas = SMOKE_STEPS.reduce((sum, step) => sum + STEP_GAS[step], 0n);
    // L1 fee Base: calldata satu tx Pool tipikal (supply), dikali jumlah tx. Akun apa saja cukup untuk serialisasi.
    const l1PerTx = isOpStack(chain.chainId)
      ? await estimateL1Fee(client, {
          chain: chain.viemChain,
          account: chain.aave.pool as Address,
          to: chain.aave.pool,
          data: encodeFunctionData({ abi: poolAbi, functionName: 'supply', args: [weth, parseEther('0.01'), chain.aave.pool, 0] }),
        })
      : 0n;
    const fee = gas * gasPrice + l1PerTx * BigInt(SMOKE_STEPS.length);
    const usd = (wei: bigint) => (Number(formatEther(wei)) * Number(ethPrice)) / 1e8;
    const mark = revision === EXPECTED_REVISION ? '✓' : `✗ (harus ${EXPECTED_REVISION}: cek ulang aturan E-Mode/event sebelum lanjut)`;
    console.log(`${chain.name}: POOL_REVISION ${revision} ${mark} · blok ${block.number} · gas ${formatGwei(gasPrice)} gwei · ETH $${(Number(ethPrice) / 1e8).toFixed(0)}`);
    console.log(
      `  smoke test ${SMOKE_STEPS.length} tx ≤ ${gas.toLocaleString('id-ID')} gas ≈ ${formatEther(fee)} ETH ($${usd(fee).toFixed(3)})` +
        (l1PerTx > 0n ? `, termasuk L1 fee ±${formatEther(l1PerTx)} ETH/tx ($${usd(l1PerTx).toFixed(4)})` : ''),
    );
    if (revision !== EXPECTED_REVISION) ok = false;
  } catch (err) {
    // Pesan viem bisa memuat URL; cukup nama error-nya.
    console.log(`${chain.name}: gagal dibaca (${(err as Error).name})`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
