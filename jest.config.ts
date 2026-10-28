import type { Config } from 'jest';

// Unit test fungsi murni di src/core (+ formatter di src/app) dan config chain di src/config (DECISIONS.md Q25 seam 1–2). Test fork (*.fork.spec.ts) nanti punya config
// sendiri. Sengaja tanpa coverageThreshold (anti-overtesting, pola swap-web Q23).
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src/core', '<rootDir>/src/config', '<rootDir>/src/app'],
  testRegex: '^(?!.*\\.fork\\.spec\\.ts$).*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { isolatedModules: true } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  passWithNoTests: true,
};

export default config;
