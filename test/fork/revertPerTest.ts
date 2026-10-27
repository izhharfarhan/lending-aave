import type { Hex } from 'viem';

import { testClient } from './clients';

// Tiap test mulai dari state yang sama: snapshot sebelum, revert sesudah. Snapshot Anvil kepake waktu di-revert, jadi
// diambil baru tiap test.
let snapshotId: Hex;

beforeEach(async () => {
  snapshotId = await testClient.snapshot();
});

afterEach(async () => {
  await testClient.revert({ id: snapshotId });
});
