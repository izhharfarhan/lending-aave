import type { Hex } from 'viem';

import { forkClients, projectChainId } from './clients';

// Tiap test mulai dari state yang sama: snapshot sebelum, revert sesudah, di Anvil chain project ini. Snapshot Anvil
// kepake waktu di-revert, jadi diambil baru tiap test.
const { testClient } = forkClients(projectChainId() ?? 1);
let snapshotId: Hex;

beforeEach(async () => {
  snapshotId = await testClient.snapshot();
});

afterEach(async () => {
  await testClient.revert({ id: snapshotId });
});
