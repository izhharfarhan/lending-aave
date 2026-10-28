// Flag Dev Tools (tiket 17, pola swap-web). Disimpan di memori modul, bukan state React: connector fork dan bacaan posisi
// membaca flag-nya saat request (runtime), bukan waktu render. Reload = reset. Di mode mainnet panelnya nggak pernah
// dimuat, jadi semuanya tetap false.
export type DevToolsFlags = {
  /** `wallet_switchEthereumChain` ditolak (langkah "Ganti ke <chain>"). */
  rejectSwitchChain: boolean;
  /** `eth_sendTransaction` ditolak: approve, delegasi, supply, withdraw, borrow, repay, toggle jaminan. */
  rejectTx: boolean;
  /** `eth_signTypedData_v4` ditolak. App ini belum meminta signature; flag ada supaya fitur Dev Tools sama dengan swap-web. */
  rejectSignature: boolean;
  /** Tiap bacaan posisi satu chain ditunda 0–3 detik (`withRandomLatency`). */
  randomLatency: boolean;
};

export const DEFAULT_DEV_TOOLS: DevToolsFlags = {
  rejectSwitchChain: false,
  rejectTx: false,
  rejectSignature: false,
  randomLatency: false,
};

let flags = DEFAULT_DEV_TOOLS;
const listeners = new Set<() => void>();

export function getDevTools(): DevToolsFlags {
  return flags;
}

export function setDevTools(patch: Partial<DevToolsFlags>) {
  flags = { ...flags, ...patch };
  listeners.forEach((listener) => listener());
}

// Untuk `useSyncExternalStore` di panel.
export function subscribeDevTools(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
