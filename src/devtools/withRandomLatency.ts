import { getDevTools } from './devTools';

const MAX_LATENCY_MS = 3_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Latency acak 0–3 detik di tiap bacaan posisi satu chain (pola swap-web Q21), untuk mengecek skeleton, "Belum lengkap",
// dan refetch di RPC yang lambat. `enabled` dibaca tiap panggilan, jadi toggle panel langsung terpakai.
export function withRandomLatency<T>(
  read: () => Promise<T>,
  { enabled = () => getDevTools().randomLatency, random = Math.random, sleep = wait }: { enabled?: () => boolean; random?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): () => Promise<T> {
  return async () => {
    if (enabled()) await sleep(Math.round(random() * MAX_LATENCY_MS));
    return read();
  };
}
