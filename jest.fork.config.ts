import type { Config } from 'jest';

// Seam 3 (DECISIONS.md Q25): adapter Aave beneran ke Anvil fork Ethereum di blok pin (Anvil khusus suite, lihat
// test/fork/globalSetup.ts). `--runInBand` wajib: semua test share satu Anvil, snapshot/revert nggak boleh balapan.
// Base/Arbitrum menyusul di tiket 10.
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '\\.fork\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { isolatedModules: true, resolveJsonModule: true } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  // Fork dingin bisa narik state dari RPC archive dulu (getReservesData pertama bisa beberapa menit).
  testTimeout: 600_000,
  globalSetup: '<rootDir>/test/fork/globalSetup.ts',
  globalTeardown: '<rootDir>/test/fork/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/fork/revertPerTest.ts'],
};

export default config;
