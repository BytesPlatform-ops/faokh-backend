import type { Config } from 'jest';

/**
 * Integration and API tests. These require a real PostgreSQL — the behaviours
 * they cover (row locking, unique constraints, transaction isolation) exist
 * *in the database* and cannot be verified against a mock.
 *
 * Run with:  docker compose up -d postgres && pnpm test:int
 */
const config: Config = {
  displayName: 'integration',
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testRegex: '.*\\.int-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  setupFilesAfterEach: undefined,
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  // Serial by default: these tests deliberately contend on the same rows, and
  // parallel workers would make failures impossible to attribute. The
  // concurrency test creates its own parallelism internally, which is the
  // controlled kind.
  maxWorkers: 1,
  testTimeout: 60_000,
};

export default config;
