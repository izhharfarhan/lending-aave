export type AppMode = 'fork' | 'mainnet';

export type ForkGuardInput = {
  mode: AppMode;
  /** Connector wallet yang lagi nyambung; `undefined` = belum connect. */
  connectorId: string | undefined;
  /** Id connector fork lokal (Anvil yang sign). */
  localConnectorId: string;
  /** Blok pin dari `src/config/forkChains.json`. */
  pinnedForkBlock: bigint;
  /**
   * `forkedNetwork.forkBlockNumber` dari `anvil_metadata` di RPC app.
   * `undefined` = masih ngecek, `null` = RPC bukan Anvil fork / nggak bisa dihubungi.
   */
  rpcForkBlock: bigint | null | undefined;
};

export type ForkGuardResult =
  | { safe: true }
  | { safe: false; reason: 'checking' | 'not_local_connector' | 'not_a_fork' | 'fork_block_mismatch' };

// Pengaman FORK MODE (pola swap-web): kalau nggak `safe`, semua aksi transaksi dikunci.
export function checkForkGuard(input: ForkGuardInput): ForkGuardResult {
  if (input.mode === 'mainnet') return { safe: true };

  if (input.connectorId !== undefined && input.connectorId !== input.localConnectorId) {
    return { safe: false, reason: 'not_local_connector' };
  }

  if (input.rpcForkBlock === undefined) return { safe: false, reason: 'checking' };

  if (input.rpcForkBlock === null) return { safe: false, reason: 'not_a_fork' };

  if (input.rpcForkBlock !== input.pinnedForkBlock) {
    return { safe: false, reason: 'fork_block_mismatch' };
  }
  return { safe: true };
}
