import type { Config } from 'jest';

/**
 * Unit tests. These must run with nothing installed but Node — no Postgres, no
 * Redis, no network — so that `pnpm test` is fast enough to run constantly and
 * works on a fresh clone.
 *
 * Anything needing a real database lives in `test/integration` and runs under
 * `jest.integration.config.ts`.
 */
const config: Config = {
  displayName: 'unit',
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test/unit'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/main.ts',
    '!src/openapi.ts',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
  // scrypt at OWASP work factors is genuinely slow; the password tests need
  // headroom on a loaded CI runner.
  testTimeout: 30_000,
};

export default config;
