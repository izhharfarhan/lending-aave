import type { Config } from 'jest';

// Seam 3 (DECISIONS.md Q25): adapter Aave beneran ke Anvil fork di blok pin, satu Anvil per chain (test/fork/globalSetup.ts).
// `--runInBand` wajib: semua test satu chain share Anvil yang sama, snapshot/revert nggak boleh balapan.
const shared = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { isolatedModules: true, resolveJsonModule: true } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  globalTeardown: '<rootDir>/test/fork/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/fork/revertPerTest.ts'],
} satisfies Config;

// Satu project per chain (pola swap-web tiket 17b): Jest cuma menjalankan globalSetup project yang punya spec di run
// itu, jadi Anvil chain lain nggak dinyalakan. Spec Base / Arbitrum dinamai `<nama>.base.fork.spec.ts` /
// `<nama>.arbitrum.fork.spec.ts`; sisanya Ethereum.
const SPEC_SUFFIX = { 8453: 'base', 42161: 'arbitrum' } as const;
const suffixes = Object.values(SPEC_SUFFIX).join('|');

const forkProject = (chainId: number, displayName: string, testRegex: string, testPathIgnorePatterns: string[] = []) => ({
  ...shared,
  displayName,
  testRegex,
  testPathIgnorePatterns: ['/node_modules/', ...testPathIgnorePatterns],
  // Path globalSetup harus beda per project: Jest cuma menjalankannya sekali per path.
  globalSetup: `<rootDir>/test/fork/globalSetup.${chainId}.ts`,
  // Dibaca revertPerTest & forkClients: snapshot/revert cuma di Anvil chain ini.
  globals: { forkChainId: chainId },
});

const config: Config = {
  // Fork dingin bisa narik state dari RPC archive dulu (getReservesData pertama bisa beberapa menit). Harus di sini,
  // bukan di project: Jest mengabaikan `testTimeout` per project.
  testTimeout: 600_000,
  projects: [
    forkProject(1, 'fork ethereum', '\\.fork\\.spec\\.ts$', [`\\.(${suffixes})\\.fork\\.spec\\.ts$`]),
    forkProject(8453, `fork ${SPEC_SUFFIX[8453]}`, `\\.${SPEC_SUFFIX[8453]}\\.fork\\.spec\\.ts$`),
    forkProject(42161, `fork ${SPEC_SUFFIX[42161]}`, `\\.${SPEC_SUFFIX[42161]}\\.fork\\.spec\\.ts$`),
  ],
};

export default config;
